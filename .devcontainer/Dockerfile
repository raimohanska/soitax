# Playwright's own image: Ubuntu + Node + all browser binaries and their system
# libraries pre-installed. Soitax's notation is rendered by abcjs, which jsdom
# can't run, so the model/behaviour suite is all the plain test runner can see.
# A real browser (Playwright) is the only thing that exercises the actual
# rendering path, hence this base rather than the generic node image.
FROM mcr.microsoft.com/playwright:v1.55.0-noble

# The base image ships a `pwuser` (uid/gid 1000) we run as. Give it a real home
# and the dirs that get named volumes / config binds mounted onto them, owned by
# pwuser. Docker creates missing mountpoint parents as root:root, which would
# leave them unwritable for the container user (EACCES on first mkdir/write).
RUN mkdir -p /home/pwuser/.local/share/opencode /home/pwuser/.config/opencode \
    && chown -R pwuser:pwuser /home/pwuser

# git + sudo aren't guaranteed in the Playwright image; the devcontainer flow
# and post-create chown need both.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git sudo ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && echo "pwuser ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/pwuser \
    && chmod 0440 /etc/sudoers.d/pwuser

# opencode - baked into the image so rebuilds reuse the layer instead of
# re-downloading. Pinned; bump when you want a newer release.
#
# The installer hardcodes $HOME/.opencode/bin and has no --prefix, so it lands
# in root's home during build; move the binary somewhere both users can reach.
# --no-modify-path stops it rewriting shell rc files we don't keep.
# VERSION must be set on `bash`, not on `curl` - the installer reads it itself.
RUN curl -fsSL https://opencode.ai/install | VERSION=1.18.21 bash -s -- --no-modify-path \
    && mv /root/.opencode/bin/opencode /usr/local/bin/opencode \
    && chmod 755 /usr/local/bin/opencode \
    && rm -rf /root/.opencode

# Trust the bind-mounted workspace at the system level. Doing this here (writes
# /etc/gitconfig) avoids touching the bind-mounted ~/.gitconfig at runtime,
# which fails with "Device or resource busy" - git can't rename-replace a file
# bind mount.
RUN git config --system --add safe.directory /workspaces/soitax
