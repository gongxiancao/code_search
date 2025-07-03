
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import chalk from 'chalk';

const exts = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rb', '.cs', '.php', '.rs', '.swift', '.kt', '.m', '.scala'];

function isCodeFile(file) {
  return exts.includes(path.extname(file));
}

function searchInFile(filePath, keyword) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });
  let lineNum = 0;
  rl.on('line', (line) => {
    lineNum++;
    if (line.includes(keyword)) {
      // chalk v5+ API: 仅支持函数式用法，使用黄底高亮
      const highlighted = line.replace(new RegExp(keyword, 'g'), (match) => chalk.bgYellowBright(match));
      console.log(`${chalk.green(filePath)}:${chalk.cyan(lineNum)}: ${highlighted}`);
    }
  });
}

function walk(dir, keyword) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, keyword);
    } else if (entry.isFile() && isCodeFile(entry.name)) {
      searchInFile(fullPath, keyword);
    }
  });
}

function main() {
  const [,, keyword, searchDir = '.'] = process.argv;
  if (!keyword) {
    console.log('用法: node search.js <关键词> [目录]');
    process.exit(1);
  }
  walk(path.resolve(searchDir), keyword);
}

main();
