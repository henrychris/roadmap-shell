const prompt = "sh> ";
process.stdout.write(prompt);

for await (let line of console) {
    line = line.trim();

    if (line === "exit") {
        process.exit(0);
    }

    const proc = Bun.spawn({
        cmd: [line],
        stdout: "inherit",
    });
    await proc.exited;
 
    process.stdout.write(prompt);
}
