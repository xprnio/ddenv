# Docker Development Environment

This is a small tool I built for simplifying setting up a container-based development environment.
The base image used is `fedora`, and it is assumed that you will be running `helix` inside of `tmux` within the container, both of which come installed with the image.
In order to make changes to the specific software used, have a look at the [Dockerfile](Dockerfile).

When building an image, it will be tagged with the workspace name.
This is to that workspaces could be built using completely different software stacks.

When starting up the container, a directory named `workspaces` is made inside the project path.
A volume will be created for this workspace inside of that directory which will be bound to the container's home directory.

### Dependencies
The only dependency for this is `podman` and `node`.
The application itself does not have any dependencies aside from `node` itself.

### Commands
The following commands are supported:
```sh
# Open a workspace interactively
manager.js [select]

# Build a workspace image
manager.js build [<workspace> [<user> = <workspace>]]

# Run a workspace
manager.js run [<workspace> [<user> = <workspace>]]

# Remove a workspace
manager.js remove [<workspace> [<user> = <workspace>]]
```
