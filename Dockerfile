FROM fedora AS base
# Install software
RUN dnf upgrade -y --refresh
RUN dnf install -y dnf-plugins-core unzip git tmux zsh
RUN dnf install -y exa bat ranger gitui
# Install helix
RUN sudo dnf copr enable -y varlad/helix
RUN sudo dnf install -y helix
# Install starship
RUN curl -sS https://starship.rs/install.sh | sh -s -- --yes

FROM base AS user-base
# Create base user
RUN useradd -m -d "/home/base" -s "/bin/zsh" base
COPY skel /home/base
RUN chown -R base "/home/base"
# Switch to base user
USER base
WORKDIR /home/base
# Install fnm into /home/base/fnm, copy into home later
RUN curl -fsSL https://fnm.vercel.app/install | sh -s -- \
  --skip-shell \
  --install-dir /home/base/.fnm
# Clone tpm into /tmp/tpm, copy into home later
RUN git clone https://github.com/tmux-plugins/tpm /home/base/.tmux/plugins/tpm
RUN /home/base/.tmux/plugins/tpm/bin/install_plugins

# Setting up the user-specific workspace
FROM base
ARG WORKSPACE_USER
# Setup home directory
COPY --from=user-base /home/base /home/base
RUN useradd -m -d "/home/$WORKSPACE_USER" -s "/bin/zsh" "$WORKSPACE_USER" && \
  cp -R /home/base/. /home/$WORKSPACE_USER && \
  chown -R "$WORKSPACE_USER" "/home/$WORKSPACE_USER" && \
  rm -rf /home/base

USER $WORKSPACE_USER
WORKDIR /home/$WORKSPACE_USER
# Finishing up
VOLUME /home/$WORKSPACE_USER
ENV UID=1000
ENV GID=1000
ENTRYPOINT zsh
