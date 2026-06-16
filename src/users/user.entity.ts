import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Role } from '../roles/role.entity';

const BCRYPT_ROUNDS = 10;

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  /**
   * Stored as a bcrypt hash. Plain-text password is NEVER persisted.
   * Use the entity hooks below to ensure hashing always happens at the ORM level.
   */
  @Column()
  password: string;

  @ManyToOne(() => Role, { nullable: true, eager: true })
  @JoinColumn({ name: 'role_id' })
  role: Role | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Soft-delete column. When populated, TypeORM filters this record out
   * of all standard queries. The physical row is never deleted.
   */
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  // -----------------------------------------------------------------------
  // bcrypt hooks — centralise hashing so no service can bypass it
  // -----------------------------------------------------------------------

  @BeforeInsert()
  async hashPasswordOnInsert(): Promise<void> {
    if (this.password) {
      this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
    }
  }

  @BeforeUpdate()
  async hashPasswordOnUpdate(): Promise<void> {
    // Only re-hash if the password field was explicitly changed
    if (this.password && !this.password.startsWith('$2b$')) {
      this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
    }
  }
}
