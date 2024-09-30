import { createProcess, handleError } from "./util.ts";

const prompt = "sh> ";
process.stdout.write(prompt);

for await (let line of console) {
    if (line === "exit") {
        process.exit(0);
    }

    try {
        const commands = line
            .split("|")
            .map((cmd) => cmd.trim().split(" ").filter(Boolean));

        if (commands.length === 1) {
            await executeCommandAsync(commands[0]);
        } else {
            await executePipelineAsync(commands);
        }
    } catch (error) {
        handleError(error);
    }

    process.stdout.write(prompt);
}

async function executeCommandAsync(command: string[]) {
    if (command[0] === "cd") {
        process.chdir(command[1]);
    } else {
        let proc = createProcess(command, "inherit");
        await proc.exited;
    }
}

async function executePipelineAsync(commands: string[][]) {
    let processInput: Blob | undefined;

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const isLast = i === commands.length - 1;

        if (command[0] === "cd") {
            process.chdir(command[1]);
            continue;
        }

        // the last process should inherit the standard output stream of the main process
        // so that its results are printed to console
        let proc = createProcess(
            command,
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
