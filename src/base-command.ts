import { Command, Flags } from '@oclif/core'

/**
 * Base command class with global --profile flag for all commands
 */
export abstract class BaseCommand extends Command {
  // Global flags available to all commands
  static baseFlags = {
    profile: Flags.string({
      char: 'P',
      description: 'Profile name to use (from ~/.linearctl/config.json)',
      helpValue: 'name',
    }),
  }
}
