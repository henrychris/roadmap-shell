import { type Subprocess } from "bun";

async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        await handleLine(line.trim());
        process.stdout.write(prompt);
    }
}

// todo: how do we use IPC to propagate messages from main process to subprocess?
// todo: implement history. first, use in-memory history. then use a file. store commands line, by line
// save history after handleLine() executes

//#region HANDLING LINE INPUT

async function handleLine(line: string) {
    if (line === "exit") {
        process.exit(0);
    }

    try {
        if (line.includes("|")) {
            await processPipeline(line);
        } else {
            await processNormalLine(line);
        }
    } catch (error) {
        handleError(error);
    }
}

//#endregion

//#region PROCESSING COMMANDS

async function processNormalLine(line: string) {
    const commands = getListOfCommands(line);
    await executeCommand(commands);
}

async function processPipeline(line: string) {
    const commands = getListOfCommands(line);
    const commandSections = getCommandSections(commands);

    try {
        await executePipeline(commandSections);
    } catch (error) {
        handleError(error);
    }
}

//#endregion

//#region PIPELINE EXECUTION

async function executePipeline(commandSections: string[][]) {
    let previousProc: Subprocess | null = null;
    let currentProc: Subprocess | null = null;

    const handleSigint = () => {
        if (currentProc && !currentProc.killed) {
            currentProc.send("SIGINT");
            process.stdout.write("\n");
            console.log("process killed in handler");
        } else {
            console.log("process not killed in handler");
            process.stdout.write("\n");
            process.exit(0); // Exit main process on CTRL+C
        }
    };

    process.on("SIGINT", handleSigint);

    try {
        for (let i = 0; i < commandSections.length; i++) {
            const section = commandSections[i];
            console.log(`Running command: ${section.join(" ")}`);

            if (i === 0) {
                // First process reads from terminal stdin
                previousProc = createProcess(section, "pipe");
                console.log(
                    `created process for command : ${section.join(" ")}`
                );
            } else {
                // For subsequent processes
                // we convert stdout from readable stream to blob, because bun throws an error if we directly pass stdout of
                // the previous process to stdin of the new process
                // see: https://github.com/oven-sh/bun/issues/8049
                const input = await Bun.readableStreamToBlob(
                    previousProc!.stdout as ReadableStream
                );
                // Wait for the previous process to exit before continuing
                await previousProc!.exited;

                currentProc = createProcess(
                    section,
                    i === commandSections.length - 1 ? "inherit" : "pipe",
                    input
                );
                console.log(
                    `created process for command : ${section.join(" ")}`
                );

                previousProc = currentProc;
                console.log("previous process completed.");
            }
        }

        // Wait for the last process to exit
        if (previousProc) {
            await previousProc.exited;
        }
    } catch (error) {
        handleError(error);
    } finally {
        process.off("SIGINT", handleSigint);
    }
}

//#endregion

//#region COMMAND EXECUTION AND PROCESS CREATION

async function executeCommand(commands: string[]) {
    const command = commands[0];

    if (command === "cd") {
        changeDirectory(commands[1]);
    } else {
        const proc = createProcess(commands, "inherit");
        process.on("SIGINT", () => {
            if (!proc.killed) {
                proc.send("SIGINT");
                process.stdout.write("\n");
                console.log("process killed in handler");
                return;
            }

            console.log("process not killed in handler");
            process.stdout.write("\n");
            process.exit(0); // Exit main process on CTRL+C
        });

        await proc.exited;
    }
}

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

function changeDirectory(path: string) {
    try {
        process.chdir(path);
    } catch {
        throw new Error(`cd: ${path}: No such file or directory`);
    }
}

//#endregion

//#region UTILITY FUNCTIONS

function getListOfCommands(line: string): string[] {
    return line.split(" ").filter(Boolean);
}

function getCommandSections(commands: string[]): string[][] {
    const commandSections: string[][] = [];
    let section: string[] = [];

    commands.forEach((command) => {
        if (command === "|") {
            if (section.length) {
                commandSections.push(section);
            }

            section = [];
        } else {
            section.push(command);
        }
    });

    if (section.length) {
        commandSections.push(section);
    }
    return commandSections;
}

function handleError(error: unknown) {
    const err = error as Error;
    console.error(err.message);
}

function printCommandSections(commandSections: string[][]) {
    console.log("Command Sections:");
    commandSections.forEach((section, index) => {
        console.log(`Section ${index + 1}:`, section);
    });
}

const handleSigint = (proc: Subprocess) => {
    if (!proc.killed) {
        proc.send("SIGINT");
        process.stdout.write("\n");
        return;
    }
    process.stdout.write("\n");
    process.exit(0); // Exit main process on CTRL+C
};

//#endregion

await main();
