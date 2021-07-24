FROM ubuntu:18.04
LABEL name="Taeeung"
LABEL email="xodmd45@gmail.com"

RUN apt-get update
RUN apt-get install -y apache2

EXPOSE 80

CMD