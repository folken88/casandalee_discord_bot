/**
 * Test script for actor index functionality
 * Run this to test the actor index system without Docker
 */

const actorIndex = require('./src/utils/actorIndex');

async function testActorIndex() {
    console.log('🧪 Testing Actor Index System...\n');
    
    // Test 1: Check if FoundryVTT data is available
    console.log('1. Checking FoundryVTT data availability...');
    if (actorIndex.isAvailable()) {
        console.log('✅ FoundryVTT data is accessible');
        console.log(`   Data path: ${actorIndex.foundryDataPath}`);
        console.log(`   Worlds path: ${actorIndex.worldsPath}`);
    } else {
        console.log('❌ FoundryVTT data is not accessible');
        console.log('   Make sure the path is correct in your .env file');
        return;
    }
    
    // Test 2: Get available worlds
    console.log('\n2. Scanning for available worlds...');
    const worlds = actorIndex.getAvailableWorlds();
    if (worlds.length === 0) {
        console.log('⚠️ No worlds found');
        return;
    }
    
    console.log(`✅ Found ${worlds.length} world(s):`);
    worlds.forEach(world => {
        console.log(`   - ${world.name} (${world.id})`);
    });
    
    // Test 3: Build actor index
    console.log('\n3. Building actor index...');
    try {
        const entries = await actorIndex.buildIndex();
        console.log(`✅ Index built with ${entries.length} entries`);
        
        if (entries.length > 0) {
            console.log('\n   Sample entries:');
            entries.slice(0, 5).forEach(entry => {
                const [name, world, dbPath] = entry.split('|');
                console.log(`   - ${name} (${world})`);
            });
        }
    } catch (error) {
        console.log('❌ Error building index:', error.message);
        return;
    }
    
    // Test 4: Search for an actor
    if (entries.length > 0) {
        console.log('\n4. Testing actor search...');
        const firstEntry = entries[0];
        const [firstName] = firstEntry.split('|');
        
        console.log(`   Searching for: ${firstName}`);
        const actorInfo = actorIndex.searchActor(firstName);
        
        if (actorInfo) {
            console.log('✅ Actor found in index:');
            console.log(`   Name: ${actorInfo.name}`);
            console.log(`   World: ${actorInfo.world}`);
            console.log(`   DB Path: ${actorInfo.dbPath}`);
        } else {
            console.log('❌ Actor not found in index');
        }
    }
    
    console.log('\n🎉 Actor Index Test Complete!');
    console.log('\nNext steps:');
    console.log('1. Run the setup script: setup-foundry-access.bat');
    console.log('2. Use /build-actor-index in Discord');
    console.log('3. Query actors with /actor name:CharacterName');
}

// Run the test
testActorIndex().catch(console.error);
