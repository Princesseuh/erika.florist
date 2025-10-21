# List of commit hashes to ignore
# Most of these commits were site-wide changes that did not affect the content
ignore_commits=("67f6075f51de7c62327fba114e9310774f94fb95" "03eb7d5aea2e4750b1db40aa363b36b409d802a6" "1c14119c3afb28a20f892926de83e7f7c9eb8141" "c02f425d27b9dd76f451f3fec0fbf45979fd1048" "0d2a48e2e108d3ebb1ee6c0d825097b55c997394" "5d77a63b0f1899235bbabd6a6629f3306efd6af4" "c5838bc8b91c59fd7fbe5743dea6d5052d7427e5" "fa0ae14cfdaf0c51f51f7bbef398ccd4496d23b7" "ccad2024da87cc5ad70a7d34e6425ac9f1062b93" "6aa96e1c68ceb62ed99efa0f4173b8f79f5dc6eb" "267bb26f822c361da2386c9325764a9c99e65316" "feb7d14386e877e8f6f0781bad8c001addcd9971")

find content/wiki -name "*.md" | while read fname; do
  echo -n "$fname|"

  # Initialize variables
  commit_found=false
  commit_index=1

  # Loop to find the first non-ignored commit
  while [ "$commit_found" = false ]; do
    current_commit=$(git log -"$commit_index" --follow --pretty="format:%H" -- "$fname" | tail -n 1)

    if [[ ! " ${ignore_commits[@]} " =~ " ${current_commit} " ]]; then
      commit_found=true
      git log -"$commit_index" --follow --date=iso --pretty="format:%cs|%H;" -- "$fname" | tail -n 1
    else
      commit_index=$((commit_index + 1))
    fi
  done
done
