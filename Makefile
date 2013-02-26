default:
	@:

install:
	@NODE_ENV=development npm i | awk '1; END { if (NF != 0) print "" }' \
		&& node util/load_sample_tracks.js

.PHONY: default install
