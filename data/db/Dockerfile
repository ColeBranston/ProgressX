# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM eclipse-temurin:17-jre-jammy

ARG SOLR_VERSION="9.10.0"
ARG SOLR_DIST="-slim"
ARG SOLR_SHA512="815868aac78e459a07fa8b5e2163d1ae70ded151735373463a769f3a58c03cd5cf3ec30ff500cd4b8ab445ecc94ca423bfe2b75d89ba0eedc8a0daf8fb325fc2"
ARG SOLR_KEYS="3558857D1F5754B78C7F8B5A71A45A3D0D8D0B93"
ARG SOLR_DOWNLOAD_SERVER="https://www.apache.org/dyn/closer.lua?action=download&filename=/solr/solr"

RUN set -ex; \
  apt-get update; \
  apt-get -y --no-install-recommends install wget gpg gnupg dirmngr; \
  rm -rf /var/lib/apt/lists/*; \
  export SOLR_BINARY="solr-$SOLR_VERSION$SOLR_DIST.tgz"; \
  wget -nv "$SOLR_DOWNLOAD_SERVER/$SOLR_VERSION/$SOLR_BINARY" -O "/opt/$SOLR_BINARY"; \
  echo "$SOLR_SHA512 */opt/$SOLR_BINARY" | sha512sum -c -; \
  tar -C /opt --extract --preserve-permissions --file "/opt/$SOLR_BINARY"; \
  rm "/opt/$SOLR_BINARY"*; \
  apt-get -y remove gpg dirmngr && apt-get -y autoremove

LABEL org.opencontainers.image.title="Apache Solr"

ENV SOLR_USER="solr" \
    SOLR_UID="8983" \
    SOLR_GROUP="solr" \
    SOLR_GID="8983" \
    PATH="/opt/solr/bin:/opt/solr/docker/scripts:$PATH" \
    SOLR_HOME=/var/solr/data \
    SOLR_LOGS_DIR=/var/solr/logs

RUN set -ex; \
  groupadd -r --gid "$SOLR_GID" "$SOLR_GROUP"; \
  useradd -r --uid "$SOLR_UID" --gid "$SOLR_GID" "$SOLR_USER"; \
  (cd /opt; ln -s solr-*/ solr); \
  mkdir -p /var/solr; \
  chown -R "$SOLR_USER:0" /var/solr

RUN set -ex; \
  apt-get update; \
  apt-get -y --no-install-recommends install acl lsof procps netcat gosu tini jattach; \
  rm -rf /var/lib/apt/lists/*

# --------- PRODUCTION-SAFE RUNTIME INIT ----------
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# -----------------------------------------------

VOLUME /var/solr
EXPOSE 8983
WORKDIR /opt/solr

USER $SOLR_UID

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["solr-foreground"]
