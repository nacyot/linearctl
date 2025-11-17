import chalk from 'chalk'

import { BaseCommand } from '../base-command.js'
import { getApiKey, getLinearClient, hasApiKey, testConnection } from '../services/linear.js'

export default class Doctor extends BaseCommand {
  static description = 'Check Linear CLI configuration and connection'
static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor)
    await this.runWithoutParse(flags.profile)
  }

  async runWithoutParse(profile?: string): Promise<void> {
    this.log(chalk.bold('\n🔍 Linear CLI Doctor\n'))

    // Check API Key
    this.log(chalk.gray('Checking configuration...'))

    const hasKey = hasApiKey(profile)
    const apiKey = getApiKey(profile)

    if (!hasKey || !apiKey) {
      this.log(`${chalk.red('✗')} API Key: ${chalk.red('Not configured')}`)
      this.log(chalk.yellow('\n  Run "lc init" to set up your API key'))
      return
    }

    // Display masked API key
    const maskedKey = apiKey.slice(0, 12) + '...' + apiKey.slice(Math.max(0, apiKey.length - 4))
    this.log(`${chalk.green('✓')} API Key: ${chalk.gray(maskedKey)}`)

    // Test connection
    this.log(chalk.gray('\nTesting connection...'))

    try {
      const isValid = await testConnection(profile)

      if (!isValid) {
        this.log(`${chalk.red('✗')} Connection: ${chalk.red('Failed')}`)
        this.log(chalk.yellow('\n  Your API key appears to be invalid'))
        this.log(chalk.yellow('  Run "lc init" to update your API key'))
        return
      }

      // Get user info
      const client = getLinearClient({ profile })
      const viewer = await client.viewer
      
      this.log(`${chalk.green('✓')} Connection: ${chalk.green('Success')}`)
      this.log(chalk.gray('\nUser Information:'))
      this.log(`  Name: ${viewer.name || 'N/A'}`)
      this.log(`  Email: ${viewer.email}`)
      
      // Get organization info
      const organization = await viewer.organization
      if (organization) {
        this.log(chalk.gray('\nOrganization:'))
        this.log(`  Name: ${organization.name}`)
      }
      
      // Check teams access
      const teams = await client.teams()
      const teamCount = teams.nodes.length
      
      this.log(chalk.gray('\nAccess:'))
      this.log(`  Teams: ${teamCount} team${teamCount === 1 ? '' : 's'}`)
      
      this.log(chalk.green('\n✅ Everything looks good!\n'))
      this.log(chalk.gray('You can start using Linear CLI:'))
      this.log(chalk.gray('  lc issue list'))
      this.log(chalk.gray('  lc issue create'))
      this.log(chalk.gray('  lc team list\n'))
      
    } catch (error) {
      this.log(`${chalk.red('✗')} Connection: ${chalk.red('Failed')}`)
      
      if (error instanceof Error) {
        this.log(chalk.red(`\n  Error: ${error.message}`))
        
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          this.log(chalk.yellow('\n  Your API key appears to be invalid'))
          this.log(chalk.yellow('  Run "lc init" to update your API key'))
        } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
          this.log(chalk.yellow('\n  Network error. Check your internet connection'))
        }
      }
    }
  }
}