reset

# Editor
export EDITOR='hx'
alias helix="$EDITOR"
alias nano="$EDITOR"
alias vim="$EDITOR"
alias hx="$EDITOR"
alias nv="$EDITOR"
alias e="$EDITOR"

# Git utilities
alias gscore='git shortlog -s -n --all --no-merges'
alias gtrigger="git commit -m 'Trigger build' --allow-empty"
alias goops="git reset --soft HEAD~1"

# Utility aliases
alias bat='bat --color=always'
alias la='exa --long --all --icons'
alias ls='exa --long --icons'
alias l='exa --icons'
alias rm='rm -i'
alias pip='python -m pip'

# Lines configured by zsh-newuser-install
HISTFILE=~/.zhistory
HISTSIZE=500000
SAVEHIST=500000
setopt appendhistory
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY

unsetopt autocd beep
bindkey -v
# End of lines configured by zsh-newuser-install
# The following lines were added by compinstall
zstyle :compinstall filename "$HOME/.zshrc"

zstyle ':completion:*' matcher-list '' 'm:{a-zA-Z}={A-Za-z}' 'r:|=*' 'l:|=* r:|=*'
autoload -Uz compinit && compinit
# End of lines added by compinstall

# fnm
export PATH="$HOME/.fnm:$PATH"
eval "$(fnm env --shell zsh)"
eval "$(starship init zsh)"

# Turso
export PATH="$HOME/.turso:$PATH"
