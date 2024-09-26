async function main() {
    const prompt = "sh> ";
    process.stdout.write(prompt);

    for await (let line of console) {
        line = line.trim();

        if (line === "exit") {
            process.exit(0);
        }

        try {
            const commands = getListOfCommands(line);
            await executeCommand(commands);
        } catch (error) {
            const err = error as Error;
            console.error(`Error: ${err.message}`);
        }

        process.stdout.write(prompt);
    }
}

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

async function executeCommand(commands: string[]) {
    const command = commands[0];

    if (command === "cd") {
        changeDirectory(commands[1]);
    } else {
        const proc = createProcess(commands);
        await proc.exited;
    }
}

function createProcess(commands: string[]) {
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

await main();
