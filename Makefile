default:
	@:

install:
	@NODE_ENV=development npm i | sed "$$ s/$$/\n/" \
		&& node util/load_sample_tracks.js

.PHONY: default install
