const { lstatSync: lstat, mkdirSync: mkdir } = require('node:fs');
const { spawnSync: spawn } = require('node:child_process');
const configure = require('./config');

const podman = (config) => {
  const run = (command, args = [], stdio = 'inherit') => {
    const child = spawn('podman', [command, ...args], { stdio });
    for (let i = 0; i < 1_000_000_000; i++);
    return child;
  };
  const runBuild = () => run('build', [
    '--build-arg', `WORKSPACE_USER=${config.user}`,
    '--tag', config.image.tag,
    __dirname,
  ]);
  const runAttach = (config) => run('run', [
    '-it',
    '--rm',
    '--replace',
    '--name', config.container.name,
    '--volume', `${config.volume.name}:/home/${config.user}:z,bind`,
    config.image.tag,
  ]);
  const runWorkspaceOwnership = () => run('unshare', [
    'chown', '-R', '1000:1000',
    config.volume.path,
  ]);
  const runCreateVolume = () => run('volume', [
    'create',
    '--opt', 'o=bind',
    '--opt', `device=${config.volume.path}`,
    config.volume.name,
  ]);

  const mkdirP = (path) => {
    mkdir(path, { recursive: true });
  };

  return {
    selectWorkspace() {
      const readline = require('node:readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const workspaces = this.getWorkspaces();
      const prompt = () => {
        const answers = workspaces.map(({ user, workspace }, i) => {
          const index = i + 1;
          process.stdout.write(`${index}: ${user} [${workspace}] \n`);

          return { index, user, workspace };
        });

        readline.question('Select a workspace: ', (answer) => {
          const index = Number.parseInt(answer.trim());
          if (Number.isNaN(index)) {
            process.stderr.write('Invalid workspace\n');
            process.stdout.write('\n');
            return prompt();
          }

          const match = answers.find(a => a.index === index);
          if (!match) {
            process.stderr.write('Invalid workspace\n');
            process.stdout.write('\n');
            return prompt();
          }

          readline.close();
          runAttach(configure(match));
        });
      }
      prompt();
    },
    listWorkspaces() {
      const workspaces = this.getWorkspaces();
      const sizes = workspaces.reduce((sizes, { user, workspace, volume }) => {
        return {
          user: Math.max(sizes.user, user.length),
          workspace: Math.max(sizes.workspace, workspace.length),
          volume: Math.max(sizes.volume, volume.path.length),
        };
      }, {
        user: 'user'.length,
        workspace: 'workspace'.length,
        volume: 'volume'.length,
      });
      const columns = Object.keys(sizes);
      const rows = workspaces.map(({ user, workspace, volume }) => {
        return [
          user.padEnd(sizes.user, ' '),
          workspace.padEnd(sizes.workspace, ' '),
          volume.path.padEnd(sizes.volume, ' '),
        ];
      });

      [
        columns.map(column => column.toUpperCase()),
        ...rows,
      ].forEach((row) => {
        row.forEach((cell, cellIndex) => {
          const key = columns[cellIndex];
          const size = sizes[key];
          process.stdout.write(cell.padEnd(size + 3, ' '));
        });
        process.stdout.write('\n')
      });
      return this;
    },
    buildWorkspaceImage() {
      runBuild();
      return this;
    },
    buildWorkspace() {
      return this
        .createWorkspaceDirectory()
        .createWorkspaceVolume();
    },
    ensureVolume() {
      return this
        .createWorkspaceDirectory()
        .createWorkspaceVolume();
    },
    runWorkspace() {
      runAttach(config);
      return this;
    },
    exists(resource, name) {
      return run(resource, ['exists', name]).status === 0;
    },
    imageExists() {
      return this.exists('image', config.image.tag);
    },
    volumeExists() {
      return this.exists('volume', config.volume.name);
    },
    volumePathExists() {
      try {
        const stat = lstat(config.volume.path);
        if (!stat.isDirectory()) return false;
        return true;
      } catch {
        return false;
      }
    },
    createWorkspaceDirectory() {
      if (this.volumePathExists()) return this;
      if (this.volumeExists()) {
        this
          .removeVolume()
          .createWorkspaceDirectory();
      }

      mkdirP(config.volume.path);
      runWorkspaceOwnership()
      return this;
    },
    createWorkspaceVolume() {
      if (this.volumeExists()) return this;

      runCreateVolume();
      return this;
    },
    removeWorkspace() {
      return this
        .removeImages()
        .removeVolume();
    },
    removeImages() {
      if (!this.imageExists()) return this;

      run('image', ['rm', config.image.tag]);
      return this;
    },
    removeVolume() {
      if (!this.volumeExists()) return this;

      run('volume', ['rm', config.volume.name]);
      return this;
    },
    getWorkspaces() {
      const containers = this.getContainers();
      return containers.reduce((workspaces, { tag }) => {
        const [workspace, user] = tag.split('-');
        if (!workspace || !user) return workspaces;
        workspaces.push(configure({ workspace, user }));
        return workspaces;
      }, []);
    },
    getContainers() {
      const result = run('image', ['list', '-af', `reference=${config.image_name}`], null).stdout.toString();
      const [columnLine, ...content] = result.split('\n').filter(Boolean);
      const columns = columnLine.split('').reduce((columns, char, charIndex) => {
        const index = columns.length - 1;
        const current = columns[index] ?? null;

        if (index < 0) {
          columns.push({ value: char, start: charIndex });
          return columns;
        }

        if (char === ' ') {
          columns[index].value += char;
          return columns;
        }

        const lastTwo = current.value.slice(-2);
        if (lastTwo == /* two spaces */ '  ') {
          // upgrade the item to a column object
          // new columns started
          columns[index].end = charIndex - 1;
          columns[index].length = current.value.length;
          columns.push({ value: char, start: charIndex });
          return columns;
        }

        columns[index].value += char;
        return columns;
      }, []);
      const fields = columns.map((column) => {
        const field = column.value
          .trim()
          .replaceAll(' ', '_')
          .toLowerCase();
        const firstLetter = field[0];
        const lowercase = field.slice(1);
        return `${firstLetter}${lowercase}`;
      });
      const rows = content.reduce((rows, line) => {
        const row = columns.map(({ start, end }) => {
          return line.slice(start, end);
        });
        rows.push(row);
        return rows;
      }, []);
      return rows.map((row) => {
        return fields.reduce((result, field, index) => {
          result[field] = row[index].trim();
          return result;
        }, {});
      });
    },
  };
};

function parseArgs(args) {
  const [command, user, workspace = user] = args;
  return [command, { workspace, user }];
}

(async function(args) {
  const [command, options] = parseArgs(args);
  const config = configure(options);

  switch (command) {
    case 'list': return podman(config).listWorkspaces();
    case 'select': return podman(config).selectWorkspace();
    case 'run': return podman(config).ensureVolume().runWorkspace();
    case 'build': return podman(config).buildWorkspaceImage().buildWorkspace();
    case 'remove': return podman(config).removeWorkspace();
    default: {
      console.error('Invalid command:', command);
      process.exit(1);
    }
  }
})(process.argv.slice(2));
