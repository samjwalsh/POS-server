#!/bin/bash
sudo echo "## SU Enabled ##"

echo "## Deleting Old Version ##"
cd /home/sam/POS-server/
rm -rf ./POS-server/

echo "## Cloning Repository##"
git clone https://github.com/samjwalsh/POS-server.git

echo "## Installing Packages ##"
cd ./POS-server/
yarn install

echo "## Copying .ENV File ##"
cd ../
cp ./.env ./POS-server/.env

echo "## Restarting Process ##"
pm2 reload POS-server

echo "## Updated POS-server. Done ##"

exit 0