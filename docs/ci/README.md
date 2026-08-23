# CI workflow

GitHub Apps need the workflows permission to push files under .github/workflows/, which this installation lacks. To enable CI, copy ci.yml in this folder to .github/workflows/ci.yml — either via the GitHub UI (Add file -> Create new file -> name it .github/workflows/ci.yml -> paste) or locally:

```bash
mkdir -p .github/workflows && cp docs/ci/ci.yml .github/workflows/ci.yml
git add .github && git commit -m "ci: add workflow" && git push
```
