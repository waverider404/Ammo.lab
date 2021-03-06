/*global importScripts Ammo*/
import { math, mathExtend } from './math.js';
import { RigidBody } from './RigidBody.js';
import { Constraint } from './Constraint.js';
import { SoftBody } from './SoftBody.js';
import { Terrain } from './Terrain.js';
import { Vehicle } from './Vehicle.js';
import { Character } from './Character.js';
import { Collision } from './Collision.js';
import { root, map } from './root.js';

/**   _   _____ _   _
*    | | |_   _| |_| |
*    | |_ _| | |  _  |
*    |___|_|_| |_| |_|
*    @author lo.th / https://github.com/lo-th
*    source https://github.com/lo-th/Ammo.lab
*
*    AMMO worker ultimate
*
*    By default, Bullet assumes units to be in meters and time in seconds.
*    Moving objects are assumed to be in the range of 0.05 units, about the size of a pebble,
*    to 10, the size of a truck.
*    The simulation steps in fraction of seconds (1/60 sec or 60 hertz),
*    and gravity in meters per square second (9.8 m/s^2).
*/
//var Module = { TOTAL_MEMORY: 64*1024*1024 };//default // 67108864
self.Module = { TOTAL_MEMORY: 256 * 1024 * 1024 };// TODO don't work ???

self.onmessage = function ( e ) {

	// ------- buffer data
	if ( e.data.Ar ) engine.setAr( e.data.Ar );

	//if( engine[ e.data.m ] ) console.log(e.data.m);
	// ------- engine function
	engine[ e.data.m ]( e.data.o );

	/*
	var data = e.data;
    var m = data.m;
    var o = data.o;

    // ------- buffer data
    if( data.Ar ) engine.setAr( data.Ar );

    switch( m ){

    	case 'init': engine.init( o ); break;
        case 'step': engine.step( o ); break;
        //case 'start': engine.start( o ); break;
        case 'reset': engine.reset( o ); break;
        case 'set': engine.set( o ); break;
        case 'setGravity': engine.setGravity( o ); break;
        // CC
        case 'setForces': engine.setForces(o); break;
        case 'setMatrix': engine.setMatrix(o); break;
        case 'setOption': engine.setOption(o); break;
        case 'setRemove': engine.setRemove(o); break;
        // ADD
        case 'add': engine.add( o ); break;
        case 'addMulty': engine.addMulty( o ); break;
        case 'addCharacter': engine.addCharacter( o ); break;
        case 'addVehicle': engine.addVehicle( o ); break;
        case 'addContact': engine.addContact( o ); break;
        case 'addAnchor': engine.addAnchor( o ); break;
        // CONFIG
        case 'setVehicle': engine.setVehicle( o ); break;
        case 'setTerrain': engine.setTerrain( o ); break;
        // CONTROLE
        case 'setDrive': engine.setDrive( o ); break;
        case 'setMove': engine.setMove( o ); break;
        case 'setAngle': engine.setAngle( o ); break;

    }
    */


};

export var engine = ( function () {

	'use strict';

	//var world = null;
	var Ar, ArPos, ArMax;
	var timestep = 1 / 60;
	var fixed = false;
	var substep = 2;

	var isBuffer = false;
	var isSoft = false;
	//var gravity = null;

	var solver, solverSoft, collisionConfig, dispatcher, broadphase;

	var tmpForces = [];
	var tmpMatrix = [];
	var tmpOption = [];

	var tmpRemove = [];
	var tmpAdd = [];

	var carName = "";
	var heroName = "";

	var zero = null;

	var numBreak = 0;

	var ray = null;



	var rigidBody, softBody, constraint, terrains, vehicles, character, collision;

	engine = {

		test: function () {},

		setAr: function ( r ) {

			Ar = r;

		},
		getAr: function () {

			return Ar;

		},

		setKey: function ( r ) {

			root.key = r;

		},
		//getKey: function () { return key; },

		setDrive: function ( name ) {

			carName = name;

		},

		setMove: function ( name ) {

			heroName = name;

		},
		setAngle: function ( o ) {

			root.angle = o.angle;

		},

		step: function ( o ) {

			root.key = o.key;

			//tmpRemove = tmpRemove.concat( o.remove );
			this.stepRemove();

			vehicles.control( carName );
			character.control( heroName );

			this.stepMatrix();
			this.stepOption();
			this.stepForces();
			

			terrains.step();

			// breakable object
			if ( numBreak !== 0 ) this.stepBreak();

			if ( fixed ) root.world.stepSimulation( o.delta, substep, timestep );
			else root.world.stepSimulation( o.delta, substep );

			rigidBody.step( Ar, ArPos[ 0 ] );
			collision.step( Ar, ArPos[ 1 ] );
			character.step( Ar, ArPos[ 2 ] );
			vehicles.step( Ar, ArPos[ 3 ] );
			softBody.step( Ar, ArPos[ 4 ] );

			// breakable object
			//if( numBreak !== 0 ) this.stepBreak();


			if ( isBuffer ) self.postMessage( { m: 'step', Ar: Ar }, [ Ar.buffer ] );
			else self.postMessage( { m: 'step', Ar: Ar } );

		},

		reset: function ( o ) {

			numBreak = 0;

			carName = "";
			heroName = "";

			tmpForces = [];
			tmpMatrix = [];
			tmpOption = [];
			
			tmpRemove = [];
			tmpAdd = [];

			rigidBody.clear();
			constraint.clear();
			softBody.clear();
			terrains.clear();
			vehicles.clear();
			character.clear();
			collision.clear();



			// clear map map
			map.clear();

			// clear math manager
			math.destroy();

			if ( o.full ) {

				this.clearWorld();
				this.createWorld();

			}

			this.setGravity();

			// create self tranfere array if no buffer
			if ( ! isBuffer ) Ar = new Float32Array( ArMax );

			//console.log('worker reset !!!')

			self.postMessage( { m: 'start' } );

		},

		addMulty: function ( o ) {

			for ( var i = 0, lng = o.length; i < lng; i ++ ) this.add( o[ i ] );
			o = [];

		},



		init: function ( o ) {

			isBuffer = o.isBuffer || false;

			//ArLng = o.settings[ 0 ];
			ArPos = o.ArPos;
			ArMax = o.ArMax;

			// create tranfere array if buffer
			if ( ! isBuffer ) Ar = new Float32Array( ArMax );

			//console.log(Module)
			//var Module = { TOTAL_MEMORY: 64*1024*1024 };//default // 67108864
			//self.Module = { TOTAL_MEMORY: 16*1024*1024 };//default // 67108864

			importScripts( o.blob );



			Ammo().then( function ( Ammo ) {

				//console.log(Module)

				mathExtend();

				engine.createWorld( o.option );
				engine.set( o.option );

				rigidBody = new RigidBody();
				constraint = new Constraint();
				softBody = new SoftBody();
				terrains = new Terrain();
				vehicles = new Vehicle();
				character = new Character();
				collision = new Collision();

				ray = new Ammo.ClosestRayResultCallback();


				vehicles.addExtra = rigidBody.add;

				self.postMessage( { m: 'initEngine' } );

			} );

		},

		//-----------------------------
		// REMOVE
		//-----------------------------

		remove: function ( name ) {

			if ( ! map.has( name ) ) return;
			var b = map.get( name );

			switch( b.type ){

				case 'solid': case 'body' :
				    rigidBody.remove( name );
				break;
				case 'soft':
				    softBody.remove( name );
				break;
				case 'terrain':
				    terrains.remove( name );
				break;
				case 'joint':
				    constraint.remove( name );
				break;

			}

			//rigidBody.remove( name );

		},


		//-----------------------------
		// ADD
		//-----------------------------

		add: function ( o ) {

			o.type = o.type === undefined ? 'box' : o.type;

			if ( o.breakable !== undefined ) {

				if ( o.breakable ) numBreak ++;

			}

			var type = o.type;
			var prev = o.type.substring( 0, 4 );

			if ( prev === 'join' ) constraint.add( o );
			else if ( prev === 'soft' || type === 'ellipsoid' ) softBody.add( o );
			else if ( type === 'terrain' ) terrains.add( o );
			else if ( type === 'character' ) character.add( o );
			else if ( type === 'collision' ) collision.add( o );
			else if ( type === 'car' ) vehicles.add( o );
			else rigidBody.add( o );

		},

		addAnchor: function ( o ) {

			softBody.addAnchor( o );

			//if ( ! map.has( o.soft ) || ! map.has( o.body ) ) return;
			//var collision = o.collision || false;
			//p1.fromArray(o.pos);
			//map.get( o.soft ).appendAnchor( o.node, map.get( o.body ), collision ? false : true, o.influence || 1 );
			//p1.free();

		},

		//-----------------------------
		// CONFIG
		//-----------------------------

		setTerrain: function ( o ) {

			terrains.setData( o );

		},

		setVehicle: function ( o ) {

			vehicles.setVehicle( o );

		},

		//-----------------------------
		// WORLD
		//-----------------------------

		createWorld: function ( o ) {

			if ( root.world !== null ) {

				console.error( 'World already existe !!' ); return;

			}

			o = o || {};

			zero = new Ammo.btVector3();
			zero.set( 0, 0, 0 );

			isSoft = o.soft === undefined ? true : o.soft;

			solver = new Ammo.btSequentialImpulseConstraintSolver();
			solverSoft = isSoft ? new Ammo.btDefaultSoftBodySolver() : null;
			collisionConfig = isSoft ? new Ammo.btSoftBodyRigidBodyCollisionConfiguration() : new Ammo.btDefaultCollisionConfiguration();
			dispatcher = new Ammo.btCollisionDispatcher( collisionConfig );



			switch ( o.broadphase === undefined ? 2 : o.broadphase ) {

				//case 0: broadphase = new Ammo.btSimpleBroadphase(); break;
				case 1: var s = 1000; broadphase = new Ammo.btAxisSweep3( new Ammo.btVector3( - s, - s, - s ), new Ammo.btVector3( s, s, s ), 4096 ); break;//16384;
				case 2: broadphase = new Ammo.btDbvtBroadphase(); break;

			}

			root.world = isSoft ? new Ammo.btSoftRigidDynamicsWorld( dispatcher, broadphase, solver, collisionConfig, solverSoft ) : new Ammo.btDiscreteDynamicsWorld( dispatcher, broadphase, solver, collisionConfig );




			//console.log(dispatcher)
			// This is required to use btGhostObjects ??
			//root.world.getPairCache().setInternalGhostPairCallback( new Ammo.btGhostPairCallback() );
			/*
			root.world.getSolverInfo().set_m_splitImpulsePenetrationThreshold(0);
			root.world.getSolverInfo().set_m_splitImpulse( true );
			*/

		},

		clearWorld: function () {

			Ammo.destroy( root.world );
			Ammo.destroy( solver );
			if ( solverSoft !== null ) Ammo.destroy( solverSoft );
			Ammo.destroy( collisionConfig );
			Ammo.destroy( dispatcher );
			Ammo.destroy( broadphase );

			root.world = null;

		},

		setWorldscale: function ( n ) {

			root.scale = n;
			root.invScale = 1 / n;

		},

		setGravity: function ( o ) {

			o = o || {};

			root.gravity = new Ammo.btVector3();
			root.gravity.fromArray( o.gravity !== undefined ? o.gravity : [ 0, - 9.81, 0 ] );
			root.world.setGravity( root.gravity );

			if ( isSoft ) {

				var worldInfo = root.world.getWorldInfo();
				worldInfo.set_m_gravity( root.gravity );

			}

		},

		set: function ( o ) {

			o = o || {};

			this.setWorldscale( o.worldscale !== undefined ? o.worldscale : 1 );

			timestep = o.fps !== undefined ? 1 / o.fps : 1 / 60;
			substep = o.substep !== undefined ? o.substep : 2;
			fixed = o.fixed !== undefined ? o.fixed : false;

			// penetration
			if ( o.penetration !== undefined ) {

				var worldDispatch = root.world.getDispatchInfo();
				worldDispatch.set_m_allowedCcdPenetration( o.penetration );// default 0.0399}

			}

			//var worldDispatch = root.world.getWorldInfo();

			//console.log(root.world.getDispatchInfo().get_m_allowedCcdPenetration())
			//	worldDispatch.set_m_allowedCcdPenetration( 10 );// default 0.0399}

			// gravity
			this.setGravity( o );

		},

		//-----------------------------
		// FORCES
		//-----------------------------

		setForces: function ( o ) {

			//if( o.constructor !== Array ) tmpForces.push(o);
			//else
			tmpForces = tmpForces.concat( o );

		},

		stepForces: function () {

			while ( tmpForces.length > 0 ) this.applyForces( tmpForces.pop() );

		},

		applyForces: function ( o ) {

			if ( ! map.has( o.name ) ) return;
			var b = map.get( o.name );

			//var type = r[ 1 ] || 'force';
			var p1 = math.vector3();
			var p2 = math.vector3();

			if ( o.direction !== undefined ) p1.fromArray( math.vectomult( o.direction, root.invScale ) );
			if ( o.distance !== undefined ) p2.fromArray( math.vectomult( o.distance, root.invScale ) );
			else p2.zero();

			switch ( o.type ) {

				case 'force' : case 0 : b.applyForce( p1, p2 ); break;// force , rel_pos
				case 'torque' : case 1 : b.applyTorque( p1 ); break;
				case 'localTorque' : case 2 : b.applyLocalTorque( p1 ); break;
				case 'forceCentral' :case 3 : b.applyCentralForce( p1 ); break;
				case 'forceLocal' : case 4 : b.applyCentralLocalForce( p1 ); break;
				case 'impulse' : case 5 : b.applyImpulse( p1, p2 ); break;// impulse , rel_pos
				case 'impulseCentral' : case 6 : b.applyCentralImpulse( p1 ); break;

					// joint

				case 'motor' : case 7 : b.enableAngularMotor( o.enable || true, o.targetVelocity, o.maxMotor ); break; // bool, targetVelocity float, maxMotorImpulse float

			}

			p1.free();
			p2.free();

		},

		//-----------------------------
		// MATRIX
		//-----------------------------

		setMatrix: function ( o ) {

			tmpMatrix = tmpMatrix.concat( o );

		},

		stepMatrix: function () {

			while ( tmpMatrix.length > 0 ) this.applyMatrix( tmpMatrix.pop() );

		},

		applyMatrix: function ( o ) {

			if ( ! map.has( o.name ) ) return;
			var b = map.get( o.name );

			var t = math.transform();

			if ( o.keepX || o.keepY || o.keepZ || o.keepRot ) { // keep original position

				b.getMotionState().getWorldTransform( t );
				var r = [];
				t.toArray( r );

				if ( o.keepX !== undefined ) o.pos[ 0 ] = r[ 0 ] - o.pos[ 0 ];
				if ( o.keepY !== undefined ) o.pos[ 1 ] = r[ 1 ] - o.pos[ 1 ];
				if ( o.keepZ !== undefined ) o.pos[ 2 ] = r[ 2 ] - o.pos[ 2 ];
				if ( o.keepRot !== undefined ) o.quat = [ r[ 3 ], r[ 4 ], r[ 5 ], r[ 6 ] ];

			}

			t.identity();

			// position and rotation
			if ( o.pos !== undefined ) {

				//o.pos = math.vectomult( o.pos, root.invScale );
				if ( o.rot !== undefined ) o.quat = math.eulerToQuadArray( o.rot, true );// is euler degree
				if ( o.quat !== undefined ) o.pos = o.pos.concat( o.quat );
				
				t.fromArray( o.pos, 0, root.invScale );

			}

			if ( o.noVelocity ) {

				b.setAngularVelocity( zero );
				b.setLinearVelocity( zero );

			}



			if ( b.isKinematic ) b.getMotionState().setWorldTransform( t );
			else b.setWorldTransform( t );

			if ( b.type === 'body' ) b.activate();
			if ( b.type === 'solid' ) self.postMessage( { m: 'moveSolid', o: { name: o.name, pos: math.vectomult( o.pos, root.scale ), quat: o.quat } } );

			t.free();

		},

		//-----------------------------
		// OPTION
		//-----------------------------

		// ___________________________STATE
		//  1  : ACTIVE
		//  2  : ISLAND_SLEEPING
		//  3  : WANTS_DEACTIVATION
		//  4  : DISABLE_DEACTIVATION
		//  5  : DISABLE_SIMULATION

		// ___________________________FLAG
		//  1  : STATIC_OBJECT
		//  2  : KINEMATIC_OBJECT
		//  4  : NO_CONTACT_RESPONSE
		//  8  : CUSTOM_MATERIAL_CALLBACK
		//  16 : CHARACTER_OBJECT
		//  32 : DISABLE_VISUALIZE_OBJECT
		//  64 : DISABLE_SPU_COLLISION_PROCESSING

		// ___________________________GROUP
		//  -1   : ALL
		//  1    : DEFAULT
		//  2    : STATIC
		//  4    : KINEMATIC
		//  8    : DEBRIS
		//  16   : SENSORTRIGGER
		//  32   : NOCOLLISION
		//  64   : GROUP0
		//  128  : GROUP1
		//  256  : GROUP2
		//  512  : GROUP3
		//  1024 : GROUP4
		//  2048 : GROUP5
		//  4096 : GROUP6
		//  8192 : GROUP7

		setOption: function ( o ) {

			tmpOption = tmpOption.concat( o );

		},

		stepOption: function () {

			while ( tmpOption.length > 0 ) this.applyOption( tmpOption.pop() );

		},

		applyOption: function ( o ) {

			if ( ! map.has( o.name ) ) return;
			var b = map.get( o.name );

			switch( b.type ){
				case 'solid': case 'body' :
				    rigidBody.applyOption( b, o );
				break;
			}

			//if ( b.isRigidBody ) rigidBody.applyOption( b, o );

			/*if ( o.flag !== undefined ) b.setCollisionFlags( o.flag );
			if ( o.state !== undefined ) b.setMotionState( o.state );

			if ( o.friction !== undefined ) b.setFriction( o.friction );
			if ( o.restitution !== undefined ) b.setRestitution( o.restitution );
			if ( o.damping !== undefined ) b.setDamping( o.damping[ 0 ], o.damping[ 1 ] );
			if ( o.rollingFriction !== undefined ) b.setRollingFriction( o.rollingFriction );

			if ( o.linearVelocity !== undefined ) b.setLinearVelocity( o.linearVelocity );
			if ( o.angularVelocity !== undefined ) b.setAngularVelocity( o.angularVelocity );

			if ( o.linearFactor !== undefined ) b.setLinearFactor( o.linearFactor );// btVector3
			if ( o.angularFactor !== undefined ) b.setAngularFactor( o.angularFactor );// btVector3

			if ( o.anisotropic !== undefined ) b.setAnisotropicFriction( o.anisotropic[ 0 ], o.anisotropic[ 1 ] );
			if ( o.sleeping !== undefined ) b.setSleepingThresholds( o.sleeping[ 0 ], o.sleeping[ 1 ] );
			if ( o.massProps !== undefined ) b.setMassProps( o.massProps[ 0 ], o.massProps[ 1 ] );

			if ( o.gravity !== undefined ) {

				if ( o.gravity ) b.setGravity( root.gravity ); else b.setGravity( zero );

			}

			// change group and mask collision
			if ( o.group !== undefined ) b.getBroadphaseProxy().set_m_collisionFilterGroup( o.group );
			if ( o.mask !== undefined ) b.getBroadphaseProxy().set_m_collisionFilterMask( o.mask );*/


		},

		//-----------------------------
		// REMOVE
		//-----------------------------

		setRemove: function ( o ) {

			tmpRemove = tmpRemove.concat( o );

		},

		stepRemove: function () {

			while ( tmpRemove.length > 0 ) this.remove( tmpRemove.pop() );

		},

		//-----------------------------
		// BREAKABLE
		//-----------------------------

		stepBreak: function () {

			var manifold, point, contact, maxImpulse, impulse;
			var pos, normal, rb0, rb1, body0, body1;

			for ( var i = 0, il = dispatcher.getNumManifolds(); i < il; i ++ ) {

				manifold = dispatcher.getManifoldByIndexInternal( i );

				body0 = Ammo.castObject( manifold.getBody0(), Ammo.btRigidBody );
				body1 = Ammo.castObject( manifold.getBody1(), Ammo.btRigidBody );

				rb0 = body0.name;
				rb1 = body1.name;

				if ( ! body0.breakable && ! body1.breakable ) continue;

				contact = false;
				maxImpulse = 0;
				for ( var j = 0, jl = manifold.getNumContacts(); j < jl; j ++ ) {

					point = manifold.getContactPoint( j );
					if ( point.getDistance() < 0 ) {

						contact = true;
						impulse = point.getAppliedImpulse();

						if ( impulse > maxImpulse ) {

							maxImpulse = impulse;
							pos = point.get_m_positionWorldOnB().toArray();
							normal = point.get_m_normalWorldOnB().toArray();

						}
						break;

					}

				}

				// If no point has contact, abort
				if ( ! contact ) continue;

				// Subdivision

				if ( body0.breakable && maxImpulse > body0.breakOption[ 0 ] ) {

					self.postMessage( { m: 'makeBreak', o: { name: rb0, pos: math.vectomult( pos, root.scale ), normal: normal, breakOption: body0.breakOption } } );
					//this.remove( rb0 );

				}

				if ( body1.breakable && maxImpulse > body1.breakOption[ 0 ] ) {

					self.postMessage( { m: 'makeBreak', o: { name: rb1, pos: math.vectomult( pos, root.scale ), normal: normal, breakOption: body1.breakOption } } );
					//this.remove( rb1 );

				}

			}

		},

		//-----------------------------
		// RAYCAST
		//-----------------------------

		rayCast: function ( o ) {

			var rayResult = [], r, result;

			for ( var i = 0, lng = o.length; i < lng; i ++ ) {

				r = o[ i ];

				result = {};

				// Reset ray
				ray.set_m_closestHitFraction( 1 );
				ray.set_m_collisionObject( null );
				// Set ray option
				if ( r.origin !== undefined ) ray.get_m_rayFromWorld().fromArray( r.origin, 0, root.invScale );
				if ( r.dest !== undefined ) ray.get_m_rayToWorld().fromArray( r.dest, 0, root.invScale );
				if ( r.group !== undefined ) ray.set_m_collisionFilterGroup( r.group );
			    if ( r.mask !== undefined ) ray.set_m_collisionFilterMask( r.mask );

				// Perform ray test
			    root.world.rayTest( ray.get_m_rayFromWorld(), ray.get_m_rayToWorld(), ray );

			    if ( ray.hasHit() ) {

			    	//console.log(ray)

			    	var name = Ammo.castObject( ray.get_m_collisionObject(), Ammo.btRigidBody ).name;
			    	if ( name === undefined ) name = Ammo.castObject( ray.get_m_collisionObject(), Ammo.btSoftBody ).name;

			    	var normal = ray.get_m_hitNormalWorld();
			    	normal.normalize();
			    	
			    	result = {
			    		hit: true,
			    		name: name,
			    		point: ray.get_m_hitPointWorld().toArray( undefined, 0, root.scale ),
			    		normal: normal.toArray(),
			    	};

			    } else {

			    	result = { hit: false };

				}

			    rayResult.push( result );

			}

		    self.postMessage( { m: 'rayCast', o: rayResult } );

		},





	};

	return engine;

} )();
