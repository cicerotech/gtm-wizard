# =============================================================================
# EFS - Elastic File System for SQLite persistence
# =============================================================================

resource "aws_efs_file_system" "main" {
  creation_token = "${local.name_prefix}-efs"
  encrypted      = true

  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = {
    Name = "${local.name_prefix}-efs"
  }
}

# Mount targets in each private subnet
resource "aws_efs_mount_target" "main" {
  count = length(aws_subnet.private)

  file_system_id  = aws_efs_file_system.main.id
  subnet_id       = aws_subnet.private[count.index].id
  security_groups = [aws_security_group.efs.id]
}

# Access point for the application
resource "aws_efs_access_point" "app" {
  file_system_id = aws_efs_file_system.main.id

  posix_user {
    gid = 1001
    uid = 1001
  }

  root_directory {
    path = "/gtm-brain-data"
    creation_info {
      owner_gid   = 1001
      owner_uid   = 1001
      permissions = "755"
    }
  }

  tags = {
    Name = "${local.name_prefix}-efs-ap"
  }
}
