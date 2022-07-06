find content/wiki -name "*.md"|while read fname; do
  echo "$fname|"
  git log -1 --date=iso --pretty="format:%cI|%H;" -- "$fname"
done
