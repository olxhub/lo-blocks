# lo-blocks profile for npm/node build and development
# Minimal profile focusing on what's needed for builds and tests

# Allow shell access
include allow-bin-sh.inc

# Load common include files for structure
include disable-common.inc
include disable-programs.inc
include disable-shell.inc

# Allow npm/node related directories
noblacklist ${HOME}/.npm
noblacklist ${HOME}/.nvm
noblacklist ${HOME}/.n

# Allow execution from home directory (needed for nvm node)
ignore noexec ${HOME}

# Allow /usr/bin/env to find node (needed for shebang scripts)
noblacklist /usr/bin/env

# Common whitelist includes
include whitelist-usr-share-common.inc
include whitelist-var-common.inc

# Allow /run for system operations
noblacklist /run
noblacklist /sys

# Networking - full access needed for server tests and interface enumeration
net host
protocol unix,inet,inet6,netlink

# Standard hardening (security restrictions that don't block needed operations)
ipc-namespace
machine-id
no3d
nodvd
nogroups
noinput
nonewprivs
noprinters
noroot
nosound
notv
nou2f
novideo

private-dev
dbus-user none
dbus-system none
