import type { Subprocess } from "bun";

async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        // a line can be: "ls -la"
        line = line.trim();

        if (line === "exit") {
            process.exit(0);
        }

        if (line.includes("|")) {
            await processPipeline(line);
        } else {
            await processNormalLine(line);
        }

        process.stdout.write(prompt);
    }
}

//#region process pipeline

async function processPipeline(line: string) {
    try {
        const commands = getListOfCommands(line);
        const commandSections = getCommandSections(commands);

        let previousProc: Subprocess | null = null;

        for (let i = 0; i < commandSections.length; i++) {
            const section = commandSections[i];

            if (i === 0) {
                // First process (reads from terminal's stdin)
                previousProc = Bun.spawn({
                    cmd: section,
                    stdout: "pipe", // pipe the stdout for chaining
                });
            } else {
                // Intermediate and final processes (chained with previous process)
                // bun throws an error when you directly assign stdout from a subprocess to stdin of another
                // this is a workaround
                let input = await Bun.readableStreamToBlob(
                    previousProc!.stdout as ReadableStream
                );

                const currentProc: Subprocess = Bun.spawn({
                    cmd: section,
                    stdin: input, // pipe from the previous process' stdout
                    stdout:
                        i === commandSections.length - 1 ? "inherit" : "pipe", // the last process outputs to terminal
                });

                // Wait for the previous process to finish
                await previousProc!.exited;

                // Move to the next process
                previousProc = currentProc;
            }
        }

        // Wait for the last process to finish
        if (previousProc) await previousProc.exited;
    } catch (error) {
        handleError(error);
    }
}

function getCommandSections(commands: string[]): string[][] {
    let commandSections: string[][] = [];
    let section: string[] = [];

    // the commands array would contain: ["ls", "-la"]
    commands.forEach((command) => {
        if (command !== "|") {
            section.push(command);
        } else {
            if (section.length !== 0) {
                commandSections.push(section);
            }

            section = [];
        }
    });

    if (section.length !== 0) {
        commandSections.push(section);
    }

    return commandSections;
}

function printCommandSections(commandSections: string[][]) {
    console.log("Command Sections:");
    commandSections.forEach((section, index) => {
        console.log(`Section ${index + 1}:`, section);
    });
}
//#endregion

//#region process normal line

async function processNormalLine(line: string) {
    try {
        // the commands array would contain: ["ls", "-la"]
        const commands = getListOfCommands(line);
        await executeCommand(commands);
    } catch (error) {
        handleError(error);
    }
}

async function executeCommand(commands: string[]) {
    const command = commands[0];

    // for piping. i guess we will need to split the commands array into multiple sections, depending
    // one where | is found.
    // each section will be created as a process, running separate commands
    // subsequent processes will receive the stdin from previous ones.
    // the last process will use the normal stdout

    if (command === "cd") {
        changeDirectory(commands[1]);
    } else {
        const proc = createProcess(commands);
        await proc.exited;
    }
}

function createProcess(commands: string[]): Subprocess {
    return Bun.spawn({
        cmd: commands,
        stdout: "inherit",
        env: { ...Bun.env },
    });
}

function changeDirectory(path: string) {
    try {
        process.chdir(path);
    } catch (error) {
        throw new Error(`cd: ${path}: No such file or directory`);
    }
}

//#endregion

//#region HELPERS

function getListOfCommands(line: string): string[] {
    let commands: string[] = [];
    let word = "";

    for (let index = 0; index < line.length; index++) {
        const char = line[index];
        // console.log(`char:${char}.`);

        if (char !== " ") {
            word += char;
        } else {
            if (word) {
                // Ensures that empty strings are not pushed
                commands.push(word);
                // console.log(`Pushed word to commands array: ${word}.`);
                word = "";
            }
        }
    }

    // Push the last word to the array (if there is any)
    if (word) {
        commands.push(word);
        // console.log(`Pushed last word to commands array: ${word}.`);
    }

    return commands;
}

function handleError(error: unknown) {
    const err = error as Error;
    console.error(`Error: ${err.message}`);
}

//#endregion

await main();
