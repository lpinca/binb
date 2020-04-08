# Specify a base image
FROM node:13-slim

# Specify a working directory
WORKDIR /app

# Copy all the files
COPY . /app

# Install ubuntu stuff
RUN apt-get update && apt-get install libcairo2-dev -y

# Install dependencies
RUN npm install

# Minify
RUN npm run minify

# Default command (by using npm start you can stop the docker container)
CMD ["npm","start"]
