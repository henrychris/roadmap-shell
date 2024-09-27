import { type Subprocess } from "bun";

// todo: how do we use IPC to propagate messages from main process to subprocess?
// todo: implement history. first, use in-memory history. then use a file. store commands line, by line
// save history after handleLine() executes

async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        await handleLine(line.trim());
        process.stdout.write(prompt);
    }
}

async function handleLine(line: string) {
    if (line === "exit") {
        process.exit(0);
    }

    const commands = line
        .split("|")
        .map((cmd) => cmd.trim().split(" ").filter(Boolean));

    try {
        if (commands.length === 1) {
            await executeCommand(commands[0]);
        } else {
            await executePipeline(commands);
        }
    } catch (error) {
        handleError(error);
    }
}

async function executeCommand(command: string[]) {
    if (command[0] === "cd") {
        process.chdir(command[1]);
    } else {
        const proc = createProcess(command, "inherit");
        await proc.exited;
    }
}

async function executePipeline(commands: string[][]) {
    let processInput: Blob | undefined;

    for (let i = 0; i < commands.length; i++) {
        const isLast = i === commands.length - 1;
        const proc = createProcess(
            commands[i],
            isLast ? "inherit" : "pipe",
            processInput
        );

        if (!isLast) {
            processInput = await Bun.readableStreamToBlob(
                proc.stdout as ReadableStream
            );
        }

        await proc.exited;
    }
}

//#region UTILITIES

function createProcess(
    commands: string[],
    stdout: "pipe" | "inherit",
    stdin: any = undefined
): Subprocess {
    return Bun.spawn({
        cmd: commands,
        stdout,
        stdin,
        env: { ...Bun.env },
        ipc(message, subprocess) {
            if (message === "SIGINT") {
                subprocess.kill();
                console.log("process killed in ipc");
            }
        },
    });
}

function handleError(error: unknown) {
    const err = error as Error;
    console.error(err.message);
}

//#endregion

await main();
