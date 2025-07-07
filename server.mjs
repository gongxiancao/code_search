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



// 读取项目配置
function getProjects() {
  try {
    return JSON.parse(fs.readFileSync(path.join('web', 'projects.json'), 'utf-8'));
  } catch {
    return [];
  }
}

// 支持分页：page, pageSize，每个文件一条，matches为多行
async function handleSearch(req, res, isPost) {
  let keyword, project, page, pageSize;
  if (isPost) {
    ({ keyword, project, page = 1, pageSize = 20 } = req.body);
  } else {
    keyword = req.query.keyword;
    project = req.query.project;
    page = parseInt(req.query.page || '1', 10);
    pageSize = parseInt(req.query.pageSize || '20', 10);
  }
  if (!keyword || !project) return res.json({ total: 0, data: [] });
  const projects = getProjects();
  const proj = projects.find(p => p.name === project);
  if (!proj) return res.json({ total: 0, data: [] });
  const baseDir = proj.path;
  // walk 返回绝对路径，需转为相对路径
  const results = (await walk(baseDir, keyword)).map(r => ({
    project,
    relative: path.relative(baseDir, r.file),
    matches: r.matches
  }));
  const total = results.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const data = results.slice(start, end);
  res.json({ total, data });
}

app.post('/api/search', (req, res) => handleSearch(req, res, true));
app.get('/api/search', (req, res) => handleSearch(req, res, false));

// 新增：返回文件内容（带行号数组）
// 新增：根据 project+relative 返回文件内容
app.get('/api/file', (req, res) => {
  const { project, relative } = req.query;
  if (!project || !relative) return res.json({ lines: null });
  const projects = getProjects();
  const proj = projects.find(p => p.name === project);
  if (!proj) return res.json({ lines: null });
  const file = path.join(proj.path, relative);
  if (!fs.existsSync(file)) return res.json({ lines: null });
  try {
    const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
    res.json({ lines });
  } catch {
    res.json({ lines: null });
  }
});


// 目录浏览接口：返回子目录和文件列表
app.get('/api/list', (req, res) => {
  const { project, relative = '' } = req.query;
  if (!project) return res.json({ entries: [] });
  const projects = getProjects();
  const proj = projects.find(p => p.name === project);
  if (!proj) return res.json({ entries: [] });
  const baseDir = proj.path;
  const dir = relative ? path.join(baseDir, relative) : baseDir;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return res.json({ entries: [] });
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        relative: relative ? (relative + '/' + e.name) : e.name
      }))
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
    res.json({ entries });
  } catch {
    res.json({ entries: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Code search web server running at http://localhost:${PORT}`);
});
