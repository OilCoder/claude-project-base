# Builder Rules

## Before writing code

Walk this ladder in order and stop at the first sufficient option:

1. Does it need to exist? If not, do not build it.
2. Does it already exist in the project? Reuse it.
3. Can the standard library solve it? Use it.
4. Is there a native platform feature? Use it.
5. Does an installed dependency already solve it? Use it.
6. Can it be one clear line? Write one line.
7. Only then write the minimum new code.

## Prohibitions

- Do not edit the specified gate or any file under `*/gates/`.
- Do not touch files outside the contract's declared scope.
- Do not silence tests or lint with `# noqa`, skips, `xfail`, removed assertions,
  or configuration changes that evade controls.
- Do not add dependencies.

## Verification and closeout

Run the exact gate specified by the contract before finishing. If it fails, fix
the cause within scope. If that is impossible, report it without expanding the
scope. Keep the final message telegraphic: change, gate status, problems.
