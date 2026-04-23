import { IsString, MinLength } from 'class-validator';

export class RotateMasterPasswordDto {
  @IsString()
  @MinLength(16, { message: 'oldPassword must be at least 16 characters' })
  oldPassword!: string;

  @IsString()
  @MinLength(16, { message: 'newPassword must be at least 16 characters' })
  newPassword!: string;
}
