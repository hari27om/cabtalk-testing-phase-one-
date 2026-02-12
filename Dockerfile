# Use an official Node.js runtime as a base image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the entire project into the container
COPY . .  

# Expose necessary ports
EXPOSE 5002
EXPOSE 80
EXPOSE 587

# Start the application
CMD ["node", "src/index.js"]
