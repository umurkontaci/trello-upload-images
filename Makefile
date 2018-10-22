.PHONY: default
.DEFAULT_GOAL: build

IMAGE = gcr.io/umur-io/trello-image

build:
	docker build . -t "$(IMAGE)"

release: build
	docker push "$(IMAGE)"