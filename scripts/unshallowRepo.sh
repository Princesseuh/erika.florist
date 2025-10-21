echo "Unshallowing repository..."
git pull --unshallow https://github.com/Princesseuh/erika.florist.git "${RENDER_GIT_COMMIT}:main" >/dev/null 2>&1
