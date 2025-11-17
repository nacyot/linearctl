import { Args } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getDefaultProfile, getProfiles, setDefaultProfile } from '../../services/linear.js'

export default class ProfileSetDefault extends BaseCommand {
  static override args = {
    name: Args.string({
      description: 'Profile name to set as default',
      required: true,
    }),
  }
  static override description = 'Set default profile'
  static override examples = [
    '<%= config.bin %> <%= command.id %> work',
    '<%= config.bin %> <%= command.id %> personal',
  ]

  public async run(): Promise<void> {
    const { args } = await this.parse(ProfileSetDefault)

    const profiles = getProfiles()
    const currentDefault = getDefaultProfile()

    // Check if profile exists
    if (!profiles[args.name]) {
      console.log(chalk.red(`✗ Profile "${args.name}" does not exist.`))
      console.log(chalk.gray('\nAvailable profiles:'))
      for (const name of Object.keys(profiles)) {
        console.log(chalk.gray(`  - ${name}`))
      }

      return
    }

    // Check if already default
    if (args.name === currentDefault) {
      console.log(chalk.yellow(`Profile "${args.name}" is already the default profile.`))
      return
    }

    // Set as default
    setDefaultProfile(args.name)

    console.log(chalk.green(`✓ Default profile set to "${args.name}".`))
    console.log(chalk.gray('\nAll commands will now use this profile by default.'))
    console.log(chalk.gray('You can still use other profiles with --profile flag.'))
  }
}
