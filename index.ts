import * as readline from "readline";
import { createProcess, handleError } from "./util.ts";
import { History } from "./history.ts";

// todo: listen for keypress and fetch history from file
// add tests? please?

let history = new History();

async function main() {
    const prompt = "sh> ";
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: prompt,
    });

    rl.prompt();

    rl.on("line", async function (line: string) {
        await handleLine(line.trim());
        history.push(line.trim());
        rl.prompt();
    });
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
        history.showHistory("stdout");
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
                history.showHistory("stdout");
            } else {
                processInput = await Bun.readableStreamToBlob(
                    history.showHistory("pipe") as ReadableStream
                );
            }
            continue;
        }

        // the last process should inherit the standard output stream of the main process
        // so that its results are printed to console
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

await main();
