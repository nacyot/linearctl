import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getDefaultProfile, getProfiles } from '../../services/linear.js'

export default class ProfileList extends BaseCommand {
  static override description = 'List all configured profiles'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(ProfileList)

    const profiles = getProfiles()
    const defaultProfile = getDefaultProfile()

    if (Object.keys(profiles).length === 0) {
      console.log(chalk.yellow('No profiles configured.'))
      console.log(chalk.gray('Run "lc init" to create your first profile.'))
      return
    }

    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            defaultProfile,
            profiles: Object.keys(profiles).map((name) => ({
              isDefault: name === defaultProfile,
              name,
            })),
          },
          null,
          2,
        ),
      )
      return
    }

    console.log(chalk.bold('\n📋 Configured Profiles\n'))

    for (const name of Object.keys(profiles)) {
      const isDefault = name === defaultProfile
      const marker = isDefault ? chalk.green('●') : chalk.gray('○')
      const label = isDefault ? chalk.green.bold(name) : chalk.white(name)
      const tag = isDefault ? chalk.gray(' (default)') : ''

      console.log(`${marker} ${label}${tag}`)
    }

    console.log('')
    console.log(chalk.gray('Use "lc --profile <name>" to switch profiles'))
    console.log(chalk.gray('Use "lc profile set-default <name>" to change default'))
    console.log('')
  }
}
