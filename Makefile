SHELL=/bin/bash -o pipefail
DIR=public/js/

default:
	@:

install:
	@NODE_ENV=development npm i | awk '1; END { if (NF != 0) print "" }' \
		&& node util/load_sample_tracks.js

minify:
	@uglifyjs $(DIR)app.js -o $(DIR)app.min.js \
		&& uglifyjs $(DIR)home.js -o $(DIR)home.min.js \
		&& uglifyjs $(DIR)leaderboards.js -o $(DIR)leaderboards.min.js

.PHONY: default install minify
