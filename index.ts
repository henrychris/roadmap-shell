import * as readline from "readline";
import { createProcess, handleError } from "./util.ts";
import { History } from "./history.ts";
import type { Subprocess } from "bun";

let currentSubprocess: Subprocess | null = null;
let history = new History();
let historyLines = await history.getLinesAsync();
let historyIndex = historyLines.length; // the last item in the index is history_index - 1

async function main() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        console.log("raw mode set");
        process.stdin.setRawMode(true);
    }

    const prompt = "sh> ";
    let currentInput = "";
    process.stdout.write(prompt);

    process.stdin.on("keypress", async function (str, key) {
        if (key.name === "return") {
            process.stdout.write("\n");
            if (currentInput.trim()) {
                await handleLineAsync(currentInput.trim());
                history.push(currentInput.trim());
                historyLines.push(currentInput.trim());
                historyIndex = historyLines.length; // Reset history index
            }

            currentInput = "";
            process.stdout.write(prompt);
        } else if (key.name === "backspace") {
            if (currentInput.length > 0) {
                currentInput = currentInput.slice(0, -1);
                process.stdout.write("\b \b"); // Move back, print space, move back again to delete character
            }
        } else if (key.name === "up") {
            if (historyIndex > 0) {
                // Navigate up in history
                historyIndex--;

                process.stdout.clearLine(-1);
                process.stdout.write(`\r${prompt}`);

                currentInput = historyLines[historyIndex];
                process.stdout.write(currentInput);
            }
        } else if (key.name === "down") {
            if (historyIndex < historyLines.length - 1) {
                // Navigate down in history
                historyIndex++;

                process.stdout.clearLine(-1);
                process.stdout.write(`\r${prompt}`);

                currentInput = historyLines[historyIndex];
                process.stdout.write(currentInput);
            }
        } else if (key.name === "left") {
            // do nothing
        } else if (key.name === "right") {
            // do nothing
        } else if (key.ctrl && key.name === "c") {
            // Handle Ctrl + C properly
            if (currentSubprocess) {
                process.kill(currentSubprocess.pid, "SIGINT");
                currentSubprocess = null;
                console.log("killed subprocess");
                process.stdout.write("\n");
            } else {
                console.log("killing main process");
                process.stdout.write("^C\n"); // Display Ctrl+C if no subprocess is running
                process.exit(0);
            }
        } else {
            currentInput += str;
            process.stdout.write(str); // Echo the typed character once
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
        currentSubprocess = createProcess(command, "inherit");
        await currentSubprocess.exited;
        currentSubprocess = null;
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
        currentSubprocess = createProcess(
            command,
            isLast ? "inherit" : "pipe",
            processInput
        );

        if (!isLast) {
            processInput = await Bun.readableStreamToBlob(
                currentSubprocess.stdout as ReadableStream
            );
        }

        await currentSubprocess.exited;
        currentSubprocess = null;
    }
}

await main();
