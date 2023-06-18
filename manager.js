const { lstatSync: lstat, mkdirSync: mkdir } = require('node:fs');
const { spawnSync: spawn } = require('node:child_process');
const configure = require('./config');
const readline = require('node:readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (question, mapValue) => new Promise(resolve => {
  const prompt = () => {
    readline.question(question, (answer) => {
      if (!answer) return prompt();
      if (!mapValue) return resolve(answer);

      const result = resolve(mapValue(answer));
      if (result === false) return prompt();
      resolve(result);
    });
  };
  prompt();
});

const podman = () => {
  const run = (command, args = [], stdio = 'inherit') => {
    const child = spawn('podman', [command, ...args], { stdio });
    for (let i = 0; i < 1_000_000_000; i++);
    return child;
  };
  const runBuild = (config) => run('build', [
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
  const runWorkspaceOwnership = (config) => run('unshare', [
    'chown', '-R', '1000:1000',
    config.volume.path,
  ]);
  const runCreateVolume = (config) => run('volume', [
    'create',
    '--opt', 'o=bind',
    '--opt', `device=${config.volume.path}`,
    config.volume.name,
  ]);

  const mkdirP = (path) => {
    mkdir(path, { recursive: true });
  };

  return {
    async autoselect(config) {
      const workspaces = this.getWorkspaces(config);
      if (workspaces.length === 0) {
        return this.interactiveSetup();
      }
      if (workspaces.length === 1) {
        const [workspace] = workspaces;
        return this.runWorkspace(configure(workspace));
      }
      return this.selectWorkspace(config);
    },
    async interactiveSetup() {
      process.stdout.write(`Let's create a new workspace for you.\n`);
      const workspace = await question('Workspace name: ');
      const user = await question('Workspace user: ');
      const config = configure({ workspace, user });
      runCommand('build', config);
      return runCommand('run', config);
    },
    async selectWorkspace(config) {
      const workspaces = this.getWorkspaces(config);

      const answers = workspaces.map(({ user, workspace }, i) => {
        const index = i + 1;
        process.stdout.write(`${index}: ${user} [${workspace}] \n`);

        return { index, user, workspace };
      });
      const match = await question('Select a workspace: ', (value) => {
        const index = Number.parseInt(value);
        if (Number.isNaN(index)) {
          process.stderr.write('Invalid workspace\n');
          process.stdout.write('\n');
          return false;
        }

        const match = answers.find(a => a.index === index);
        if (!match) {
          process.stderr.write('Invalid workspace\n');
          process.stdout.write('\n');
          return false;
        }

        return match;
      });

      if (!match) return;
      return runAttach(configure(match));
    },
    listWorkspaces(config) {
      const workspaces = this.getWorkspaces(config);
      const sizes = workspaces.reduce((sizes, { user, workspace, volume }) => {
        return {
          workspace: Math.max(sizes.workspace, workspace.length),
          user: Math.max(sizes.user, user.length),
          volume: Math.max(sizes.volume, volume.path.length),
        };
      }, {
        workspace: 'workspace'.length,
        user: 'user'.length,
        volume: 'volume'.length,
      });
      const columns = Object.keys(sizes);
      const rows = workspaces.map(({ user, workspace, volume }) => {
        return [
          workspace.padEnd(sizes.workspace, ' '),
          user.padEnd(sizes.user, ' '),
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
    buildWorkspaceImage(config) {
      runBuild(config);
      return this;
    },
    buildWorkspace(config) {
      return this
        .createWorkspaceDirectory(config)
        .createWorkspaceVolume(config);
    },
    ensureVolume(config) {
      return this
        .createWorkspaceDirectory(config)
        .createWorkspaceVolume(config);
    },
    runWorkspace(config) {
      runAttach(config);
      return this;
    },
    exists(resource, name) {
      return run(resource, ['exists', name]).status === 0;
    },
    imageExists(config) {
      return this.exists('image', config.image.tag);
    },
    volumeExists(config) {
      return this.exists('volume', config.volume.name);
    },
    volumePathExists(config) {
      try {
        const stat = lstat(config.volume.path);
        if (!stat.isDirectory()) return false;
        return true;
      } catch {
        return false;
      }
    },
    createWorkspaceDirectory(config) {
      if (this.volumePathExists(config)) return this;
      if (this.volumeExists(config)) {
        this
          .removeVolume(config)
          .createWorkspaceDirectory(config);
      }

      mkdirP(config.volume.path);
      runWorkspaceOwnership(config);
      return this;
    },
    createWorkspaceVolume(config) {
      if (this.volumeExists(config)) return this;

      runCreateVolume(config);
      return this;
    },
    removeWorkspace(config) {
      return this
        .removeImages(config)
        .removeVolume(config);
    },
    removeImages(config) {
      if (!this.imageExists(config)) return this;

      run('image', ['rm', config.image.tag]);
      return this;
    },
    removeVolume(config) {
      if (!this.volumeExists(config)) return this;

      run('volume', ['rm', config.volume.name]);
      return this;
    },
    getWorkspaces(config) {
      const containers = this.getContainers(config);
      return containers.reduce((workspaces, { tag }) => {
        const [workspace, user] = tag.split('-');
        if (!workspace || !user) return workspaces;
        workspaces.push(configure({ workspace, user }));
        return workspaces;
      }, []);
    },
    getContainers(config) {
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
  const [command, workspace, user = workspace] = args;
  return [command, { workspace, user }];
}

function runCommand(command, config = configure()) {
  switch (command) {
    case undefined: return podman().autoselect(config);
    case 'select': return podman().selectWorkspace(config);
    case 'list': return podman().listWorkspaces(config);
    case 'run': return podman().ensureVolume(config).runWorkspace(config);
    case 'build': return podman().buildWorkspaceImage(config).buildWorkspace(config);
    case 'remove': return podman().removeWorkspace(config);
    default: {
      console.error('Invalid command:', command);
      process.exit(1);
    }
  }
}

(async function(args) {
  const [command, options] = parseArgs(args);
  const config = configure(options);
  await runCommand(command, config);
  readline.close();
})(process.argv.slice(2));
