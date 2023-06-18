const path = require('node:path');

const defaults = {
  user: 'workspace-user',
  workspace: 'workspace',
  image_name: 'xprnio/ddenv',
  workspaces_path: './workspaces',
};

module.exports = (config = {}) => {
  Object.assign(config, {
    user: config.user ?? process.env.WORKSPACE_USER ?? defaults.user,
    workspace: config.workspace ?? process.env.WORKSPACE_NAME ?? defaults.workspace,
    image_name: config.image_name ?? process.env.IMAGE_NAME ?? defaults.image_name,
    workspaces_path: config.workspaces_path ?? process.env.WORKSPACE_VOLUME ?? defaults.workspaces_path,
  });

  return {
    user: config.user,
    workspace: config.workspace,
    image_name: config.image_name,
    workspaces_path: config.workspaces_path,

    image: workspaceImage(config),
    container: workspaceContainer(config),
    volume: workspaceVolume(config),
  };
};

function workspaceImage({ user, workspace, image_name }) {
  return { tag: `${image_name}:${workspace}-${user}` };
}

function workspaceContainer({ user, workspace, image_name }) {
  const [namespace, image] = image_name.split('/');
  if (!image) {
    return { name: `${namespace}_${workspace}-${user}` };
  }
  return { name: `${image}_${workspace}-${user}` };
}

function workspaceVolume({ user, workspace, image_name, workspaces_path }) {
  const { name: containerName } = workspaceContainer({ user, workspace, image_name, workspaces_path });
  return {
    name: `v-${containerName}`,
    path: path.relative(
      __dirname,
      path.resolve(__dirname, workspaces_path, `${workspace}-${user}`),
    ),
  };
}