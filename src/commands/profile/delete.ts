import { confirm } from '@inquirer/prompts'
import { Args } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { clearApiKey, getDefaultProfile, getProfiles } from '../../services/linear.js'

export default class ProfileDelete extends BaseCommand {
  static override args = {
    name: Args.string({
      description: 'Profile name to delete',
      required: true,
    }),
  }
  static override description = 'Delete a profile'
  static override examples = [
    '<%= config.bin %> <%= command.id %> work',
    '<%= config.bin %> <%= command.id %> personal',
  ]

  public async run(): Promise<void> {
    const { args } = await this.parse(ProfileDelete)

    const profiles = getProfiles()
    const defaultProfile = getDefaultProfile()

    // Check if profile exists
    if (!profiles[args.name]) {
      console.log(chalk.red(`✗ Profile "${args.name}" does not exist.`))
      console.log(chalk.gray('\nAvailable profiles:'))
      for (const name of Object.keys(profiles)) {
        console.log(chalk.gray(`  - ${name}`))
      }

      return
    }

    // Warn if deleting default profile
    if (args.name === defaultProfile) {
      console.log(
        chalk.yellow(`⚠ You are about to delete the default profile "${args.name}".`),
      )
    }

    // Confirm deletion
    const shouldDelete = await confirm({
      default: false,
      message: `Are you sure you want to delete profile "${args.name}"?`,
    })

    if (!shouldDelete) {
      console.log(chalk.gray('Deletion cancelled.'))
      return
    }

    // Delete profile
    clearApiKey(args.name)

    console.log(chalk.green(`✓ Profile "${args.name}" deleted successfully.`))

    // Show remaining profiles
    const remainingProfiles = getProfiles()
    if (Object.keys(remainingProfiles).length > 0) {
      console.log(chalk.gray('\nRemaining profiles:'))
      for (const name of Object.keys(remainingProfiles)) {
        const isDefault = name === getDefaultProfile()
        const marker = isDefault ? chalk.green('●') : chalk.gray('○')
        console.log(`  ${marker} ${name}${isDefault ? chalk.gray(' (default)') : ''}`)
      }
    } else {
      console.log(chalk.yellow('\nNo profiles remaining.'))
      console.log(chalk.gray('Run "lc init" to create a new profile.'))
    }
  }
}
