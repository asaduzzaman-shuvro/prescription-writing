#!/usr/bin/env bash
# Downloads the Kaggle "Assorted Medicine Dataset of Bangladesh" (2022) into data/dev-seed/.
# DEV ONLY: this data is scraped from medex.com.bd, whose terms forbid reuse/redistribution.
# Never commit it and never load it into a production database.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/dev-seed
curl -fsSL -o data/dev-seed/ds.zip \
  https://www.kaggle.com/api/v1/datasets/download/ahmedshahriarsakib/assorted-medicine-dataset-of-bangladesh
unzip -o -q data/dev-seed/ds.zip -d data/dev-seed
rm data/dev-seed/ds.zip
ls -la data/dev-seed
