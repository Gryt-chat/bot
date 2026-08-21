# Changesets

A pull request that changes what `@gryt/bot` does should carry a changeset:

```bash
yarn changeset
```

Pick `patch`, `minor` or `major`, write a sentence somebody reading the
changelog would want, and commit the file it writes.

**Write it for the person upgrading, not for the person reviewing.** "Bots
declare what they want on the first join and cannot widen it later" is useful.
"Refactor bot admission" is not.

Merging to `main` opens or updates a **Version Packages** pull request with
every changeset collected so far. Merging *that* publishes to npm.

Wait for it to collect everything before merging it — merging early publishes a
version and leaves the rest for the next one, which is how a release ends up
missing half its changelog.

Not every change needs one. Docs, CI, tests and the examples change nothing for
somebody installing the package, so they do not.
