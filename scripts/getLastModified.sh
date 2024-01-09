# Unshallow the repository when running on Vercel
# Vercel doesn't register the remote in the local repository so the full URL is used.
# Also, the branch is always named master on Vercel's build system
if [ $VERCEL == "1" ]; do
  git pull --unshallow https://github.com/Princesseuh/erika.florist.git "${PUBLIC_VERCEL_GIT_COMMIT_SHA}:master"
fi

find src/content/wiki -name "*.mdx"|while read fname; do
  echo "$fname|"
  git log -1 --date=iso --pretty="format:%cI|%H;" -- "$fname"
done
