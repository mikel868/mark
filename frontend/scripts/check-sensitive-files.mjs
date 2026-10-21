import { execFileSync } from 'node:child_process'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

const forbidden = tracked.filter(
  (file) =>
    /(^|\/)(\.env(?:\.(?!example$)[^/]+)?|backend\.env|\.backend\.env\.[^/]+|\.htpasswd(?:\.local)?|htpasswd\.local|config\/application-local\.ya?ml|deploy\/k8s\/secret(?:\.example copy)?\.ya?ml|id_rsa|id_ed25519)$/i.test(
      file,
    ) ||
    /\.(?:pem|key|p12|pfx|dump|sql\.gz)$/i.test(file) ||
    /(^|\/)backups\//i.test(file),
)

if (forbidden.length > 0) {
  console.error(`本地凭据文件不能进入 Git:\n${forbidden.join('\n')}`)
  process.exit(1)
}

console.log('未发现禁止提交的本地凭据文件。')
