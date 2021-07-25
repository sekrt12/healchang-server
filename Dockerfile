FROM node:14-alpine
LABEL name="Taeeung"
LABEL email="xodmd45@gmail.com"

RUN mkdir -p /app
WORKDIR /app

COPY package*.json ./
# ADD . /app
RUN npm install

RUN npm install -g pm2 

# COPY . ./
ADD ./ /app

EXPOSE 3001

# RUN npm run build

CMD ["pm2-runtime", "start", "app.js", "--watch"]