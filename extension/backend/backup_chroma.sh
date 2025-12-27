#!/bin/bash

# Configuration
BACKUP_DIR="/root/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/chroma_backup_$TIMESTAMP.tar.gz"
MAX_BACKUPS=7

# Create backup directory
mkdir -p $BACKUP_DIR

echo "Starting backup at $(date)"

# Stop Semantic Search container to ensure data consistency
echo "Stopping semantic-search container..."
docker compose -f /root/docker-compose.yml stop semantic-search

# Create backup of the volume
echo "Creating backup archive..."
# We use a temporary container to mount the volume and tar it
docker run --rm \
  -v root_chroma_data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/chroma_backup_$TIMESTAMP.tar.gz -C /data .

# Restart Semantic Search container
echo "Restarting semantic-search container..."
docker compose -f /root/docker-compose.yml start semantic-search

# Check if backup was created
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Cleanup old backups (keep last $MAX_BACKUPS)
    echo "Cleaning up old backups..."
    ls -t $BACKUP_DIR/chroma_backup_*.tar.gz | tail -n +$(($MAX_BACKUPS + 1)) | xargs -r rm --
else
    echo "Backup FAILED!"
    exit 1
fi

echo "Backup process finished at $(date)"
