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
  const matches = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (line.includes(keyword)) {
      // 保留原始缩进，防止 HTML 渲染时丢失空格
      const safeLine = line.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
      const highlighted = safeLine.replace(new RegExp(keyword, 'g'), `<mark>${keyword}</mark>`);
      matches.push({ line: lineNum, content: highlighted });
    }
  }
  return matches.length ? { file: filePath, matches } : null;
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
        const res = await searchInFile(fullPath, keyword);
        if (res) results.push(res);
      }
    }
  } else if (stat.isFile() && isCodeFile(targetPath)) {
    const res = await searchInFile(targetPath, keyword);
    if (res) results.push(res);
  }
  return results;
}


// 支持分页：page, pageSize，每个文件一条，matches为多行
async function handleSearch(req, res, isPost) {
  let keyword, dir, page, pageSize;
  if (isPost) {
    ({ keyword, dir, page = 1, pageSize = 20 } = req.body);
  } else {
    keyword = req.query.keyword;
    dir = req.query.dir;
    page = parseInt(req.query.page || '1', 10);
    pageSize = parseInt(req.query.pageSize || '20', 10);
  }
  if (!keyword) return res.json({ total: 0, data: [] });
  const baseDir = dir || process.cwd();
  const results = await walk(baseDir, keyword);
  const total = results.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const data = results.slice(start, end);
  res.json({ total, data });
}

app.post('/api/search', (req, res) => handleSearch(req, res, true));
app.get('/api/search', (req, res) => handleSearch(req, res, false));

// 新增：返回文件内容（带行号数组）
app.get('/api/file', (req, res) => {
  const file = req.query.file;
  if (!file || !fs.existsSync(file)) return res.json({ lines: null });
  try {
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    res.json({ lines });
  } catch {
    res.json({ lines: null });
  }
});

app.listen(PORT, () => {
  console.log(`Code search web server running at http://localhost:${PORT}`);
});
