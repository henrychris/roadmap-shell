import { createProcess, handleError } from "./util.ts";

// todo use node readline
// read line by line and ensure that the normal other functionality still works
// listen for keypress and pipe key press to stdin
// add tests? like, c'mon man

// todo: implement history. first, use in-memory history. then use a file. store commands line, by line
// save history after handleLine() executes
// history could be a class...
let history: string[] = [];

async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        await handleLine(line.trim());
        history.push(line.trim());
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
    } else if (command[0] === "history") {
        showHistory("stdout");
    } else {
        const proc = createProcess(command, "inherit");

        const handleSigint = () => {
            if (!proc.killed) {
                process.kill(proc.pid, "SIGINT");
                process.stdout.write("\n");
                return;
            }

            process.stdout.write("\n");
            process.exit(0);
        };
        process.on("SIGINT", handleSigint);

        await proc.exited;
        process.removeListener("SIGINT", handleSigint);
    }
}

async function executePipeline(commands: string[][]) {
    let processInput: Blob | undefined;

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const isLast = i === commands.length - 1;

        if (command[0] === "cd") {
            process.chdir(command[1]);
            continue;
        }

        if (command[0] === "history") {
            if (isLast) {
                showHistory("stdout");
            } else {
                processInput = await Bun.readableStreamToBlob(
                    showHistory("pipe") as ReadableStream
                );
            }
            continue;
        }

        // the last process should inherit the standard output stream of the main process
        // so that its results are printed to conole
        const proc = createProcess(
            command,
            isLast ? "inherit" : "pipe",
            processInput
        );

        const handleSigint = () => {
            if (!proc.killed) {
                process.kill(proc.pid, "SIGINT");
                process.stdout.write("\n");
                return;
            }

            process.stdout.write("\n");
            process.exit(0);
        };
        process.on("SIGINT", handleSigint);

        if (!isLast) {
            processInput = await Bun.readableStreamToBlob(
                proc.stdout as ReadableStream
            );
        }

        await proc.exited;
        process.removeListener("SIGINT", handleSigint);
    }
}

function showHistory(output: "pipe" | "stdout"): ReadableStream | undefined {
    if (output === "stdout") {
        history.forEach((item, index) => {
            process.stdout.write(`${index + 1} `);
            process.stdout.write(`${item}`);
            process.stdout.write("\n");
        });
        return;
    } else {
        return new ReadableStream({
            start(controller) {
                history.forEach((item, index) => {
                    controller.enqueue(`${index + 1} ${item}\n`);
                });
                controller.close();
            },
        });
    }
}

await main();
