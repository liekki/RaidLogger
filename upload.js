#!/usr/bin/env node
'use strict';

// Written by Kof

const
   MAX_RAID_OPTIONS = 20,
   colors = require('ansi-256-colors'),
   colorInfo = colors.fg.getRgb(0, 1, 4),
   colorWarning = colors.fg.getRgb(5, 5, 0),
   colorGreen = colors.fg.getRgb(0, 3, 0),
   colorInfoBright = colors.fg.getRgb(1, 2, 5),
   colorEpic = colors.fg.getRgb(3, 0, 4),
   nocolor = colors.reset,
   classColor = {
      "Druid": colors.fg.getRgb(Math.round(5), Math.round(0.49*5), Math.round(0.04*5)),
      "Hunter": colors.fg.getRgb(Math.round(0.67*5), Math.round(0.83*5), Math.round(0.45*5)),
      "Mage": colors.fg.getRgb(Math.round(0.25*5), Math.round(0.78*5), Math.round(0.92*5)),
      "Paladin": colors.fg.getRgb(Math.round(0.96*5), Math.round(0.55*5), Math.round(0.73*5)),
      "Priest": colors.fg.getRgb(5, 5, 5),
      "Rogue": colors.fg.getRgb(5, Math.round(0.96*5), Math.round(0.41*5)),
      "Shaman": colors.fg.getRgb(0, Math.round(0.44*5), Math.round(0.87*5)),
      "Warlock": colors.fg.getRgb(Math.round(0.53*5), Math.round(0.53*5), Math.round(0.93*5)),
      "Warrior": colors.fg.getRgb(Math.round(0.78*5), Math.round(0.61*5), Math.round(0.43*5)),
   },
   inquirer = require("inquirer-async"),
   fs = require("fs"),
   path = require('path')
;

function playerColor(playerClass) {
   return classColor[playerClass] || colorInfo;
}

function sortPlayerByClass(classes) {
   return (a, b) => {
      const classa = classes[a], classb = classes[b];
      if (classa < classb)
         return -1;
      if (classa > classb)
         return 1;
      return 0;
   }
}

function printUsageAndExit() {
   console.log('USAGE: node upload.js [WEBSITE_API]');
   console.log('WEBSITE_API = Uploads data to this website endpoint');
   process.exit(1);
}

/**
 * Searches for a file, scans up or down the tree
 * @param dir starting directory
 * @param filename search file with this name
 * @param scanBackwards if false, drills down the tree; if true goes back (up)
 * @return {String} if stopWhenFound, returns a file. if not, returns array of files.
 */
function searchRecursive(dir, filename, scanBackwards) {
   let files = fs.readdirSync(dir);
   for (let i = 0; i < files.length; i++) {
      let file = path.resolve(dir, files[i]);
      let stat = fs.statSync(file);
      if (path.basename(file).toLowerCase() === filename.toLowerCase())
         return file;
      if (!scanBackwards && stat.isDirectory()) {
         file = searchRecursive(file, filename, scanBackwards);
         if (file)
            return file;
      }
   }
   if (scanBackwards) {
      const nextDir = path.join(dir, '..');
      if (nextDir !== dir)
         return searchRecursive(path.join(dir, '..'), filename, scanBackwards);
   }
   return null;
}

function readRaids(lua) {
   let raids, classes;
   const luaContent = fs.readFileSync(lua).toString('utf8');
   try {
      // convert LUA format to JSON format
      let jsonContent =
         luaContent
            .replace(/\["/g, '"')
            .replace(/"]/g, '"')
            .replace(/\[/g, '"')
            .replace(/]/g, '"')
            .replace(/ = /g, ": ")
            .replace(/Store: /g, "")
            .replace(/[\t\n\r]/g, "")
            .replace(/,}/g, "}")
      ;
      let store = JSON.parse(jsonContent);

      const dateCompare = (left, right) => left.date.localeCompare(right.date);
      raids = Object.values(store['raids']).sort(dateCompare).reverse();
      classes = store['players'] || {};

      if (raids.length > MAX_RAID_OPTIONS)
         raids.splice(MAX_RAID_OPTIONS);

      raids.forEach(raid => {
         raid['attended'] = Object.values(raid['attended']);
         raid['benched'] = Object.values(raid['benched']);
      });
   } catch (e) {
      console.error(`Failed parsing LUA file: ${e.message}`);
      console.log(luaContent);
      process.exit(1);
   }

   if (!raids || !raids.length) {
      console.log(`No raids found.`);
      process.exit(1);
   }
   return {raids, classes};
}

async function main() {
   try {
      let wtfFile = searchRecursive(__dirname, 'WTF', 1);
      if (!wtfFile) {
         console.error(`Couldn't find WoW root folder! Make sure to run this file somewhere within your WoW folder, or one of its sub-folders`);
         process.exit(1);
      }

      let luaFile = searchRecursive(wtfFile, 'RaidLogger.lua', 0);
      if (!luaFile) {
         console.error(`Couldn't find RaidLogger.lua output file! It should be under SavedVariables after finishing a raid with /rl end`);
         process.exit(1);
      }
      console.log(`\nUsing ${colorWarning}${luaFile}${nocolor}`);

      const {raids, classes} = readRaids(luaFile);

// console.log(`Last raid:`);
// console.log(raids);

      let raidOptions = raids.map(o => `${o['date']} / ${o['zone']} / ${o['attendedCount']} participants, ${o['benchedCount']} benched`);
      raidOptions.push('Cancel');

      console.log('');
      let answers = await inquirer.promptAsync([{
         type: 'list',
         name: 'action',
         message: 'Choose a raid:',
         choices: raidOptions
      }]);
      const answerIndex = raidOptions.indexOf(answers['action']);

      if (answerIndex === raidOptions.length - 1)
         process.exit(0);

      const raid = raids[answerIndex];

      let playerByClass = {};
      raid['attended']
         .sort(sortPlayerByClass(classes))
         .forEach(p => playerByClass[classes[p]] = (playerByClass[classes[p]] || []).concat(`${playerColor(classes[p])}${p}`));
      const playersGroupedByClass =
         Object.values(playerByClass)
            .map(players => players.join(", "))
            .join('\n  ');

      console.log(`\nParticipants:\n  ${playersGroupedByClass}${nocolor}\n`);
      if (raid['benched'] && raid['benched'].length)
         console.log(`Benched:${colorInfo}\n  ${raid['benched'].join('\n  ')}${nocolor}\n`);
      console.log(`Loot:\n  ${Object.values(raid['loot'] || {}).map(o => {
         if (o['de'])
            return `${colorGreen}Disenchanted ${colorEpic}[${o['item']}]${nocolor}`;
         else 
            return `${playerColor(classes[o['player']])}${o['player']} ${colorGreen}received ${colorEpic}[${o['item']}]${nocolor}`; 
      }).join('\n  ')}${nocolor}\n`);

      answers = await inquirer.promptAsync([{
         type: 'list',
         name: 'action',
         message: 'Proceed with upload?',
         choices: ['Stop', 'Upload']
      }]);

      if (answers['action'] === 'Upload') {
         console.log('Uploading!');
      }
   } catch (e) {
      console.error(`Exception: ${e.message}`);
   }
}

main();
