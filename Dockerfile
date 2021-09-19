FROM node:16-alpine3.11

# Setup working directory
WORKDIR /app

# Copy package.json and related files
COPY package*.json ./

# Install dependencies on the container
RUN npm install --quiet

# Copy application files
COPY . .

# Compile to JavaScript
RUN npm run build

# Delete development dependencies
RUN npm prune --production

# Change file ownership to user node
RUN chown -R node: /app

# Run as user node
USER node

CMD ["npm", "run", "start"]