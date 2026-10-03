# Security Policy

CATTIPU OS runs real processes on the machine that serves it (Forge builds,
Launch runtimes) and can hold AI provider keys in `.env.local`, so security
reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting:
**Security → Report a vulnerability** on
[this repository](https://github.com/anirvamn/cattipu-os/security). Include
steps to reproduce and the impact you see. You'll get a response as soon as
possible, and credit in the fix unless you'd rather not.

## Scope

CATTIPU is meant to run **locally**, for its own user. Forge and Launch are
switched off under `next start` unless explicitly enabled. Issues of
particular interest:

- any way for a request, project file or AI output to run a command or
  executable, or to read or write outside its sandbox;
- a Launch runtime serving anything outside its artifact directory, or
  binding beyond `127.0.0.1`;
- secrets reaching the browser, build output, logs or Project Memory.
