import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const source = path.dirname(fileURLToPath(import.meta.url));
const revision = "a".repeat(40);
const imageId = `sha256:${"b".repeat(64)}`;
const bash = process.env.BASH_FOR_TESTS || "bash";

function fixture(
  t,
  {
    configured = false,
    databaseRunning = true,
    failUpdate = false,
    archive = false,
    storage = "classic",
    manifest,
    saveFails = false,
  } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), "mark-deploy-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const release = path.join(root, "releases", `${revision}-1-1`);
  const bin = path.join(root, "bin");
  mkdirSync(release, { recursive: true });
  mkdirSync(bin);
  for (const file of [
    "deploy.sh",
    "configure.sh",
    "compose.yml",
    "image-config-digest.sh",
  ]) {
    copyFileSync(path.join(source, file), path.join(release, file));
  }
  const exported = path.join(root, "exported");
  mkdirSync(exported);
  writeFileSync(
    path.join(exported, "manifest.json"),
    JSON.stringify(
      manifest ?? [
        {
          Config:
            storage === "classic"
              ? `${imageId.slice(7)}.json`
              : `blobs/sha256/${imageId.slice(7)}`,
          RepoTags: [`mark-backend:${revision}`],
          Layers: [],
        },
      ],
    ),
  );
  writeFileSync(path.join(release, "revision"), `${revision}\n`);
  writeFileSync(path.join(release, "backend.id"), `${imageId}\n`);
  writeFileSync(path.join(release, "frontend.id"), `${imageId}\n`);
  if (archive)
    writeFileSync(
      path.join(release, "images.tar.gz"),
      gzipSync("test image archive"),
    );
  if (configured)
    writeFileSync(path.join(root, "backend.env"), "DB_PASSWORD=test-only\n", {
      mode: 0o600,
    });
  const log = path.join(root, "docker.log");
  // Git Bash lacks util-linux flock; Linux CI uses the real file-lock implementation.
  if (process.platform === "win32") {
    writeFileSync(path.join(bin, "flock"), "#!/usr/bin/env bash\nexit 0\n", {
      mode: 0o755,
    });
  }
  writeFileSync(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_TEST_LOG"
case "$1" in
  network) exit 0 ;;
  inspect)
    if [[ "$*" == *'.State.Running'* ]]; then echo '${databaseRunning}';
    elif [[ "$*" == *'.Mounts'* ]]; then echo mark-postgres-data; fi ;;
  image)
    case "$2" in
      inspect) echo '${storage === "classic" ? imageId : `sha256:${"d".repeat(64)}`}' ;;
      save)
        cat "$DOCKER_TEST_IMAGE_ARCHIVE"
        if [[ '${saveFails}' == true ]]; then exit 1; fi ;;
      *) exit 1 ;;
    esac ;;
  load) cat >/dev/null ;;
  compose)
    if [[ "$*" == *' up '* && '${failUpdate}' == true ]]; then exit 1; fi ;;
  exec) exit 0 ;;
  *) echo 'Unexpected Docker operation' >&2; exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    DOCKER_TEST_LOG: log,
    DOCKER_TEST_IMAGE_ARCHIVE: path
      .join(root, "exported.tar")
      .replaceAll("\\", "/"),
    MSYS: "winsymlinks:nativestrict",
  };
  const originalPath =
    Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ||
    "";
  for (const key of Object.keys(env))
    if (key.toLowerCase() === "path") delete env[key];
  env.PATH = `${bin}${path.delimiter}${originalPath}`;
  const setup = spawnSync(
    bash,
    [
      "-c",
      `tar -cf ../../exported.tar -C ../../exported manifest.json && sha256sum compose.yml configure.sh deploy.sh image-config-digest.sh revision backend.id frontend.id${archive ? " images.tar.gz" : ""} > SHA256SUMS`,
    ],
    {
      cwd: release,
      env,
      encoding: "utf8",
    },
  );
  assert.equal(setup.status, 0, setup.stderr);
  const run = () =>
    spawnSync(bash, [path.join(release, "deploy.sh")], {
      cwd: release,
      env,
      encoding: "utf8",
    });
  return {
    root,
    release,
    run,
    log: () => (existsSync(log) ? readFileSync(log, "utf8") : ""),
  };
}

test("first upload waits for private configuration without starting any application", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MARK_DEPLOY_STATUS=needs-configuration/);
  assert.ok(existsSync(path.join(f.root, "pending-release")));
  assert.ok(!existsSync(path.join(f.root, "current-release")));
  assert.doesNotMatch(f.log(), /\bup\b|\bdown\b|\brm\b|\bvolume\b/);
});

test("configured deployment starts only the frontend and backend from loaded images", (t) => {
  const f = fixture(t, { configured: true });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MARK_DEPLOY_STATUS=deployed/);
  assert.match(
    f.log(),
    /up .*--no-build.*--pull never.*--wait.*backend frontend/,
  );
  assert.doesNotMatch(f.log(), /\bdown\b|\brm\b|\bvolume\b/);
  assert.match(
    readFileSync(path.join(f.root, "current-release"), "utf8"),
    /releases/,
  );
});

test("unavailable existing database stops deployment before changing containers", (t) => {
  const f = fixture(t, { configured: true, databaseRunning: false });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mark-postgres must be running/);
  assert.doesNotMatch(f.log(), /\bcompose\b|\bload\b|\bup\b/);
  assert.ok(!existsSync(path.join(f.root, "current-release")));
});

test("failed container update does not report the revision as deployed", (t) => {
  const f = fixture(t, { configured: true, failUpdate: true });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Application update failed/);
  assert.doesNotMatch(result.stdout, /MARK_DEPLOY_STATUS=deployed/);
  assert.ok(!existsSync(path.join(f.root, "current-release")));
});

test("containerd image ID may differ while the saved configuration digest matches", (t) => {
  const f = fixture(t, { configured: true, storage: "containerd" });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MARK_DEPLOY_STATUS=deployed/);
  assert.doesNotMatch(f.log(), /image inspect/);
});

test("unexpected loaded configuration digest stops deployment", (t) => {
  const f = fixture(t, { configured: true });
  writeFileSync(
    path.join(f.release, "backend.id"),
    `sha256:${"c".repeat(64)}\n`,
  );
  const env = { ...process.env };
  const result = spawnSync(
    bash,
    [
      "-c",
      "sha256sum compose.yml configure.sh deploy.sh image-config-digest.sh revision backend.id frontend.id > SHA256SUMS",
    ],
    {
      cwd: f.release,
      env,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const failure = f.run();
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /Image configuration digest mismatch/);
  assert.doesNotMatch(f.log(), /\bup\b/);
});

for (const [name, options] of [
  [
    "different config despite a matching daemon ID",
    { manifest: [{ Config: `${"c".repeat(64)}.json` }] },
  ],
  ["invalid config path", { manifest: [{ Config: "../../invalid" }] }],
  [
    "multiple configurations",
    {
      manifest: [
        { Config: `${imageId.slice(7)}.json` },
        { Config: `${imageId.slice(7)}.json` },
      ],
    },
  ],
  ["missing configuration", { manifest: [] }],
  ["failed image export", { saveFails: true }],
]) {
  test(`${name} stops deployment before changing applications`, (t) => {
    const f = fixture(t, { configured: true, ...options });
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(f.log(), /\bcompose\b/);
    assert.ok(!existsSync(path.join(f.root, "current-release")));
  });
}

test("archive is loaded once and removed, while a retry can use the retained image", (t) => {
  const f = fixture(t, { archive: true });
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(!existsSync(path.join(f.release, "images.tar.gz")));
  const second = f.run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(
    f
      .log()
      .split("\n")
      .filter((line) => line === "load").length,
    1,
  );
});

test("corrupt release files stop before Docker operations", (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.release, "compose.yml"), "corrupted");
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(f.log(), "");
});

test("Compose resolves private values literally and never defines a database service", (t) => {
  const f = fixture(t, { configured: true });
  const password = `test-only-$literal:'"\\value`;
  writeFileSync(path.join(f.root, "backend.env"), `DB_PASSWORD=${password}\n`, {
    mode: 0o600,
  });
  const emptyEnv = path.join(f.root, "empty.env");
  writeFileSync(emptyEnv, "");
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      emptyEnv,
      "-f",
      path.join(f.release, "compose.yml"),
      "config",
      "--format",
      "json",
    ],
    {
      env: { ...process.env, RELEASE_SHA: revision },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(resolved.services).sort(), [
    "backend",
    "frontend",
  ]);
  // The config exporter doubles '$' to make its output safe to interpolate again.
  // CI also checks the actual container environment, not just this serialized model.
  assert.equal(
    resolved.services.backend.environment.DB_PASSWORD,
    password.replaceAll("$", () => "$$"),
  );
  assert.equal(
    resolved.services.backend.environment.DB_URL,
    "jdbc:postgresql://mark-postgres:5432/mark",
  );
  assert.equal(resolved.services.backend.ports, undefined);
  assert.equal(resolved.networks.mark.external, true);
  assert.equal(resolved.networks.mark.name, "mark-network");
});
