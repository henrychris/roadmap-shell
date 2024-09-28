import * as readline from "readline";
import { createProcess, handleError } from "./util.ts";
import { History } from "./history.ts";

let history = new History();
let historyLines = await history.getLinesAsync();
let historyIndex = historyLines.length; // the last item in the index is history_index - 1

async function main() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    const prompt = "sh> ";
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: prompt,
    });

    let currentInput = "";
    rl.prompt();

    process.stdin.on("keypress", async function (str, key) {
        if (key.name === "return") {
            if (currentInput.trim()) {
                await handleLineAsync(currentInput.trim());
                history.push(currentInput.trim());
                historyLines.push(currentInput.trim());
                historyIndex = historyLines.length; // Reset history index
            }

            currentInput = "";
            rl.prompt();
        } else if (key.name === "backspace") {
            if (currentInput.length > 0) {
                currentInput = currentInput.slice(0, -1);
                process.stdout.write("\b \b"); // Move back, print space, move back again to delete character
            }
        } else if (key.name === "up") {
            if (historyIndex > 0) {
                historyIndex--;
                rl.write(null, { ctrl: true, name: "u" }); // Clear current input
                currentInput = historyLines[historyIndex];
                process.stdout.write(currentInput);
            }
        } else if (key.name === "down") {
            if (historyIndex < historyLines.length - 1) {
                // Navigate down in history
                historyIndex++;
                rl.write(null, { ctrl: true, name: "u" }); // Clear current input
                currentInput = historyLines[historyIndex];
                process.stdout.write(currentInput);
            }
        } else {
            currentInput += str;
        }
    });
}

async function handleLineAsync(line: string) {
    if (line === "exit") {
        process.exit(0);
    }

    const commands = line
        .split("|")
        .map((cmd) => cmd.trim().split(" ").filter(Boolean));

    try {
        if (commands.length === 1) {
            await executeCommandAsync(commands[0]);
        } else {
            await executePipelineAsync(commands);
        }
    } catch (error) {
        handleError(error);
    }
}

async function executeCommandAsync(command: string[]) {
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

async function executePipelineAsync(commands: string[][]) {
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
