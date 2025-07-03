import express from 'express';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const app = express();
const PORT = 3000;
const exts = ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.go', '.rb', '.cs', '.php', '.rs', '.swift', '.kt', '.m', '.scala', '.dart'];

app.use(express.static('web'));
app.use(express.json());

function isCodeFile(file) {
  return exts.includes(path.extname(file));
}

async function searchInFile(filePath, keyword) {
  const results = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes(keyword)) {
      // 高亮关键词
      const highlighted = line.replace(new RegExp(keyword, 'g'), `<mark>${keyword}</mark>`);
      results.push({ file: filePath, line: lineNum, content: highlighted });
    }
  }
  return results;
}

async function walk(targetPath, keyword) {
  let results = [];
  if (!fs.existsSync(targetPath)) return results;
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(await walk(fullPath, keyword));
      } else if (entry.isFile() && isCodeFile(entry.name)) {
        results = results.concat(await searchInFile(fullPath, keyword));
      }
    }
  } else if (stat.isFile() && isCodeFile(targetPath)) {
    results = results.concat(await searchInFile(targetPath, keyword));
  }
  return results;
}

app.post('/api/search', async (req, res) => {
  const { keyword, dir } = req.body;
  if (!keyword) return res.json([]);
  const baseDir = dir || process.cwd();
  const results = await walk(baseDir, keyword);
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`Code search web server running at http://localhost:${PORT}`);
});
